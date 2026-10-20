import {
  APP_VERSION,
  COLOR_MODE_IDS,
  LIMITS,
  createDefaultSettings,
  isUnsafeGlyph,
  sanitizeSettings,
  settingsEqual,
  state,
} from "./state.js";
import { els, isEditableElement, validateDom } from "./dom.js";
import {
  decodeImageFile,
  initImageLoader,
  validateImageFile,
} from "./image-loader.js";
import { processImage } from "./image-processing.js";
import {
  applyEdits,
  generateAsciiGrid,
  gridToText,
} from "./ascii-engine.js";
import {
  applyTextPreviewStyle,
  paintCell as paintCanvasCell,
  renderCanvas,
  renderTextPreview,
} from "./renderer.js";
import * as presets from "./presets.js";
import * as exporters from "./exports.js";
import { EditHistory } from "./history.js";
import * as ui from "./ui.js";

const CHARSET_NOTE_DEFAULT = "Dark pixels map to the first glyph; bright pixels to the last.";
const history = new EditHistory({ limit: 80 });

let customPresets = [];
let processedCache = null;
let renderTimer = null;
let renderFrame = null;
let fitFrame = null;
let imageLoadToken = 0;
let stroke = null;
let compareDrag = null;
let initialized = false;

function showActionError(error, prefix = "ERROR") {
  const message = error?.message || String(error || "Unknown error");
  ui.setProcessing(false);
  ui.setStatus(`${prefix} — ${message}`, "error");
  ui.toast(message, "error", 5000);
}

function clearScheduledRender() {
  if (renderTimer) {
    window.clearTimeout(renderTimer);
    renderTimer = null;
  }
  if (renderFrame) {
    window.cancelAnimationFrame(renderFrame);
    renderFrame = null;
  }
}

function scheduleFit() {
  if (fitFrame) window.cancelAnimationFrame(fitFrame);
  fitFrame = window.requestAnimationFrame(() => {
    fitFrame = null;
    fitCanvasDisplay();
  });
}

function fitCanvasDisplay() {
  if (!state.grid || !state.image) return;
  const canvas = els.outputCanvas;
  if (!canvas.width || !canvas.height) return;

  const style = window.getComputedStyle(els.stage);
  const paddingX = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
  const paddingY = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
  const availableWidth = els.stage.clientWidth - paddingX;
  const availableHeight = els.stage.clientHeight - paddingY;
  if (availableWidth <= 1 || availableHeight <= 1) return;

  const scale = Math.min(availableWidth / canvas.width, availableHeight / canvas.height);
  const displayWidth = Math.max(1, Math.floor(canvas.width * scale));
  const displayHeight = Math.max(1, Math.floor(canvas.height * scale));

  els.canvasLayer.style.width = `${displayWidth}px`;
  els.canvasLayer.style.height = `${displayHeight}px`;
}

function refreshTextPreview() {
  if (!state.grid) return;
  renderTextPreview(state.grid, state.settings, els.textPreview);
  applyTextPreviewStyle(els.textPreview, state.settings);
  state.textGrid = state.grid;
  state.dirty.text = false;
  ui.updateTextToolbar(state.settings);
}

function updateTextToolbarValues() {
  ui.updateTextToolbar(state.settings);
}

function getProcessedImage() {
  if (!state.image) throw new Error("No image is loaded.");
  const settings = state.settings;
  const cacheKey = [
    state.image.url,
    settings.brightness,
    settings.contrast,
    settings.edgeDetection ? 1 : 0,
  ].join("|");

  if (processedCache?.key === cacheKey) return processedCache.processed;

  const processed = processImage(state.image.element, settings);
  processedCache = { key: cacheKey, processed };
  return processed;
}

function scheduleRender({ grid = false, reprocess = false, debounce = 45 } = {}) {
  if (!state.image) {
    ui.setProcessing(false);
    return;
  }
  if (grid) {
    state.dirty.grid = true;
    state.dirty.text = true;
  }
  if (reprocess) state.dirty.reprocess = true;
  state.dirty.canvas = true;
  state.isProcessing = true;
  ui.setProcessing(true);
  clearScheduledRender();

  const run = () => {
    renderFrame = null;
    flushRender();
  };

  if (debounce > 0) {
    renderTimer = window.setTimeout(() => {
      renderTimer = null;
      renderFrame = window.requestAnimationFrame(run);
    }, debounce);
  } else {
    renderFrame = window.requestAnimationFrame(run);
  }
}

function flushRender() {
  if (!state.image) return false;

  const needsText = state.viewMode === "text"
    && state.grid
    && (state.dirty.text || state.textGrid !== state.grid);
  const needsWork = state.dirty.grid
    || state.dirty.canvas
    || !state.grid
    || !state.lastCanvasMeta
    || state.canvasGrid !== state.grid
    || needsText;

  if (!needsWork) {
    state.isProcessing = false;
    ui.setProcessing(false);
    return true;
  }

  const started = performance.now();
  state.isProcessing = true;
  ui.setProcessing(true);
  let droppedEdits = 0;

  try {
    if (state.dirty.grid || !state.grid) {
      const processed = getProcessedImage();
      const previousGrid = state.grid;
      const nextGrid = generateAsciiGrid(processed, state.settings);

      if (state.edits.size) {
        if (
          previousGrid
          && previousGrid.cols === nextGrid.cols
          && previousGrid.rows === nextGrid.rows
        ) {
          applyEdits(nextGrid, state.edits);
        } else {
          droppedEdits = state.edits.size;
          state.edits.clear();
          history.clear();
          ui.setEditCount(0);
          ui.setHistoryState(false, false);
        }
      }

      state.grid = nextGrid;
      state.dirty.canvas = true;
      state.dirty.text = true;
    }

    if (state.dirty.canvas || !state.lastCanvasMeta || state.canvasGrid !== state.grid) {
      const meta = renderCanvas(state.grid, state.settings, els.outputCanvas, {
        showEdits: state.editMode,
        editedIndices: state.edits,
      });
      state.lastCanvasMeta = meta;
      state.canvasGrid = state.grid;
      state.dirty.canvas = false;
      scheduleFit();
    }

    if (state.viewMode === "text" && state.grid) {
      if (state.dirty.text || state.textGrid !== state.grid) refreshTextPreview();
      else applyTextPreviewStyle(els.textPreview, state.settings);
    }

    state.dirty.grid = false;
    state.dirty.reprocess = false;
    state.isProcessing = false;
    ui.setProcessing(false);
    ui.updateStats(state.grid, state.lastCanvasMeta);
    ui.setExportAvailability(Boolean(state.grid));
    updateTextToolbarValues();

    const elapsed = Math.round(performance.now() - started);
    if (droppedEdits) {
      const message = `Manual edits cleared — the grid changed from ${droppedEdits} edited cells to a new size.`;
      ui.setStatus(`RENDERED — ${state.grid.cols}×${state.grid.rows} · ${message}`, "warning");
      ui.toast(message, "warning", 5200);
    } else {
      ui.setStatus(
        `RENDERED — ${state.grid.cols}×${state.grid.rows} characters in ${elapsed} ms`,
        "success",
      );
    }
    return true;
  } catch (error) {
    console.error("ASCII.FORGE render failed:", error);
    state.isProcessing = false;
    ui.setProcessing(false);
    ui.setStatus(`RENDER ERROR — ${error.message}`, "error");
    ui.toast(error.message, "error", 5000);
    return false;
  }
}

function ensureFresh() {
  if (!state.image) return false;
  const needsWork = state.dirty.grid
    || state.dirty.canvas
    || !state.grid
    || !state.lastCanvasMeta
    || state.canvasGrid !== state.grid;
  if (needsWork) {
    clearScheduledRender();
    flushRender();
  }
  return Boolean(state.grid && state.lastCanvasMeta);
}

function repaintCanvasOnly() {
  if (!state.grid) return;
  const meta = renderCanvas(state.grid, state.settings, els.outputCanvas, {
    showEdits: state.editMode,
    editedIndices: state.edits,
  });
  state.lastCanvasMeta = meta;
  state.canvasGrid = state.grid;
  state.dirty.canvas = false;
  state.dirty.text = true;
  ui.updateStats(state.grid, meta);
  ui.setExportAvailability(true);
  scheduleFit();
}

function updateSettings(patch) {
  const next = sanitizeSettings({ ...state.settings, ...patch }, state.settings);
  if (settingsEqual(next, state.settings)) return false;
  state.settings = next;
  ui.setActiveBuiltIn(next.charset);
  return true;
}

function applyLoadedSettings(settings, { toastMessage = "" } = {}) {
  const next = sanitizeSettings(settings, createDefaultSettings());
  if (!settingsEqual(next, state.settings)) {
    state.settings = next;
    if (state.image) {
      scheduleRender({ grid: true, debounce: 0 });
    }
  }
  ui.syncControls(state.settings);
  updateTextToolbarValues();
  applyTextPreviewStyle(els.textPreview, state.settings);
  if (toastMessage) ui.toast(toastMessage, "success");
}

function setViewMode(mode, { silent = false } = {}) {
  if (!state.image || !state.grid) return;

  if (mode === "text") {
    if (state.compareEnabled) {
      state.compareEnabled = false;
      ui.setCompare(false, state.comparePosition);
    }
    if (state.editMode) setEditMode(false, { silent: true });
    if (!ensureFresh()) return;
    state.viewMode = "text";
    ui.setViewMode("text");
    refreshTextPreview();
    scheduleFit();
    if (!silent) {
      ui.setStatus(
        `TEXT VIEW — ${state.grid.rows} lines · ${state.grid.cols} columns · uncolored`,
        "ready",
      );
    }
  } else {
    state.viewMode = "canvas";
    ui.setViewMode("canvas");
    fitCanvasDisplay();
    scheduleFit();
    if (!silent) {
      ui.setStatus(`CANVAS VIEW — ${state.grid.cols}×${state.grid.rows} characters`, "ready");
    }
  }
}

function setComparison(enabled, { silent = false } = {}) {
  const next = Boolean(enabled);
  if (next === state.compareEnabled) return;

  if (next) {
    if (!state.image || !state.grid) return;
    if (state.viewMode === "text") setViewMode("canvas", { silent: true });
    if (state.editMode) setEditMode(false, { silent: true });
    if (!ensureFresh()) return;
    state.compareEnabled = true;
    ui.setCompare(true, state.comparePosition);
    if (!silent) {
      ui.setStatus("COMPARE — drag the divider, click the image, or use the arrow keys", "ready");
    }
  } else {
    state.compareEnabled = false;
    compareDrag = null;
    document.body.classList.remove("is-comparing");
    ui.setCompare(false, state.comparePosition);
    if (!silent) ui.setStatus("COMPARISON OFF — showing generated ASCII", "ready");
  }
}

function toggleComparison() {
  setComparison(!state.compareEnabled);
}

function setEditMode(enabled, { silent = false } = {}) {
  const next = Boolean(enabled);
  if (next === state.editMode) return;

  if (next) {
    if (!state.image || !state.grid) return;
    if (!ensureFresh()) return;
    if (state.viewMode === "text") setViewMode("canvas", { silent: true });
    if (state.compareEnabled) setComparison(false, { silent: true });
    state.editMode = true;
    ui.setEdit(true);
    ui.setEditCount(state.edits.size);
    ui.setHistoryState(history.canUndo, history.canRedo);
    repaintCanvasOnly();
    ui.focusCanvas();
    if (!silent) {
      ui.setStatus(
        `EDIT MODE — paint or erase characters · ${state.edits.size} manual edits`,
        "ready",
      );
    }
  } else {
    if (stroke) finishStroke();
    state.editMode = false;
    ui.setEdit(false);
    if (state.grid) repaintCanvasOnly();
    ui.setEditCount(state.edits.size);
    ui.setHistoryState(history.canUndo, history.canRedo);
    if (!silent) {
      ui.setStatus(
        state.edits.size
          ? `EDITING PAUSED — ${state.edits.size} manual edits are preserved`
          : "EDITING PAUSED",
        "ready",
      );
    }
  }
}

function toggleEditMode() {
  setEditMode(!state.editMode);
}

function cellIndexFromPointer(clientX, clientY) {
  if (!state.grid) return null;
  const rect = els.outputCanvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const relativeX = (clientX - rect.left) / rect.width;
  const relativeY = (clientY - rect.top) / rect.height;
  if (relativeX < 0 || relativeX >= 1 || relativeY < 0 || relativeY >= 1) return null;
  const col = Math.min(state.grid.cols - 1, Math.floor(relativeX * state.grid.cols));
  const row = Math.min(state.grid.rows - 1, Math.floor(relativeY * state.grid.rows));
  return row * state.grid.cols + col;
}

function brushCharacter() {
  if (state.editTool === "erase") return " ";
  const character = Array.from(els.brushChar.value || state.brushChar || "#")[0] || "#";
  return character;
}

function paintIndex(index) {
  if (!state.grid || !stroke || !Number.isInteger(index)) return;
  const character = brushCharacter();
  const current = state.grid.chars[index];
  if (current === character) return;

  if (!stroke.changes.has(index)) {
    stroke.changes.set(index, {
      index,
      before: current,
      beforeEdited: state.edits.has(index),
    });
  }

  state.grid.chars[index] = character;
  state.edits.set(index, character);
  state.dirty.text = true;

  if (!state.lastCanvasMeta) return;
  paintCanvasCell(
    els.outputCanvas,
    state.grid,
    state.settings,
    index,
    state.lastCanvasMeta,
    { showEdits: true, editedIndices: state.edits },
  );
  ui.setEditCount(state.edits.size);
}

function finishStroke() {
  if (!stroke || !state.grid) {
    stroke = null;
    return;
  }

  const changes = [];
  for (const entry of stroke.changes.values()) {
    const after = state.grid.chars[entry.index];
    const afterEdited = state.edits.has(entry.index) ? state.edits.get(entry.index) : null;
    if (entry.before === after && entry.beforeEdited === Boolean(afterEdited !== null)) continue;
    changes.push({
      index: entry.index,
      before: entry.before,
      after,
      beforeEdited: entry.beforeEdited,
      afterEdited: afterEdited !== null,
    });
  }

  const pointerId = stroke.pointerId;
  stroke = null;
  if (pointerId !== undefined) {
    try {
      els.outputCanvas.releasePointerCapture(pointerId);
    } catch {
      // Pointer capture may already have been released by the browser.
    }
  }

  if (changes.length) {
    history.record(changes);
    ui.setHistoryState(history.canUndo, history.canRedo);
    repaintCanvasOnly();
    ui.setStatus(
      `EDITED — ${changes.length} cell${changes.length === 1 ? "" : "s"} · ${state.edits.size} manual edit${state.edits.size === 1 ? "" : "s"} total`,
      "ready",
    );
  }
}

function applyHistoryEntry(changes, direction) {
  if (!state.grid) return;
  for (const change of changes) {
    if (change.index < 0 || change.index >= state.grid.chars.length) continue;
    const targetChar = direction === "undo" ? change.before : change.after;
    const targetEdited = direction === "undo" ? change.beforeEdited : change.afterEdited;
    state.grid.chars[change.index] = targetChar;
    if (targetEdited) state.edits.set(change.index, targetChar);
    else state.edits.delete(change.index);
  }
  state.dirty.text = true;
  repaintCanvasOnly();
  if (state.viewMode === "text") refreshTextPreview();
  ui.setEditCount(state.edits.size);
  ui.setHistoryState(history.canUndo, history.canRedo);
}

function undoEdit() {
  if (!state.grid || stroke) return;
  const entry = history.undo();
  if (!entry) return;
  applyHistoryEntry(entry, "undo");
  ui.setStatus(`UNDO — ${state.edits.size} manual edit${state.edits.size === 1 ? "" : "s"} remaining`, "ready");
}

function redoEdit() {
  if (!state.grid || stroke) return;
  const entry = history.redo();
  if (!entry) return;
  applyHistoryEntry(entry, "redo");
  ui.setStatus(`REDO — ${state.edits.size} manual edit${state.edits.size === 1 ? "" : "s"} total`, "ready");
}

async function clearEdits() {
  if (!state.edits.size || !state.grid) return;
  const count = state.edits.size;
  const confirmed = await ui.confirmAction({
    title: "Clear manual edits?",
    message: `This removes ${count} manual character edit${count === 1 ? "" : "s"} and restores the generated grid. The action cannot be undone.`,
    confirmLabel: "Clear edits",
  });
  if (!confirmed) return;
  state.edits.clear();
  history.clear();
  ui.setEditCount(0);
  ui.setHistoryState(false, false);
  state.dirty.grid = true;
  state.dirty.text = true;
  scheduleRender({ grid: true, debounce: 0 });
  ui.toast("Manual edits cleared.", "success");
}

function updateCompareFromPointer(clientX) {
  if (!state.compareEnabled) return;
  const rect = els.canvasLayer.getBoundingClientRect();
  if (!rect.width) return;
  const percentage = ((clientX - rect.left) / rect.width) * 100;
  state.comparePosition = Math.min(100, Math.max(0, percentage));
  ui.setComparePosition(state.comparePosition);
}

function initComparison() {
  els.canvasLayer.addEventListener("pointerdown", (event) => {
    if (!state.compareEnabled || !state.image || !state.grid) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (!event.isPrimary) return;
    event.preventDefault();
    compareDrag = { pointerId: event.pointerId };
    document.body.classList.add("is-comparing");
    try {
      els.canvasLayer.setPointerCapture(event.pointerId);
    } catch {
      // Safari can decline capture; window listeners still complete the drag.
    }
    els.compareDivider.focus({ preventScroll: true });
    updateCompareFromPointer(event.clientX);
  });

  els.canvasLayer.addEventListener("pointermove", (event) => {
    if (!compareDrag || compareDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    updateCompareFromPointer(event.clientX);
  });

  const finish = (event) => {
    if (!compareDrag || compareDrag.pointerId !== event.pointerId) return;
    compareDrag = null;
    document.body.classList.remove("is-comparing");
    try {
      els.canvasLayer.releasePointerCapture(event.pointerId);
    } catch {
      // Capture may already be released.
    }
  };

  window.addEventListener("pointerup", finish);
  window.addEventListener("pointercancel", finish);

  els.canvasLayer.addEventListener("dblclick", () => {
    if (!state.compareEnabled) return;
    state.comparePosition = 50;
    ui.setComparePosition(50);
  });

  els.compareDivider.addEventListener("keydown", (event) => {
    if (!state.compareEnabled) return;
    let delta = 0;
    if (event.key === "ArrowLeft") delta = event.shiftKey ? -10 : -2;
    if (event.key === "ArrowRight") delta = event.shiftKey ? 10 : 2;
    if (event.key === "Home") {
      state.comparePosition = 0;
      event.preventDefault();
    } else if (event.key === "End") {
      state.comparePosition = 100;
      event.preventDefault();
    } else if (delta) {
      state.comparePosition = Math.min(100, Math.max(0, state.comparePosition + delta));
      event.preventDefault();
    } else {
      return;
    }
    ui.setComparePosition(state.comparePosition);
  });
}

function initEditing() {
  els.outputCanvas.addEventListener("pointerdown", (event) => {
    if (!state.editMode || state.compareEnabled || !state.grid) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (!event.isPrimary) return;
    event.preventDefault();
    stroke = { pointerId: event.pointerId, changes: new Map() };
    try {
      els.outputCanvas.setPointerCapture(event.pointerId);
    } catch {
      // Window-level pointerup still ends the stroke.
    }
    const index = cellIndexFromPointer(event.clientX, event.clientY);
    if (index !== null) paintIndex(index);
    ui.focusCanvas();
  });

  els.outputCanvas.addEventListener("pointermove", (event) => {
    if (!stroke || stroke.pointerId !== event.pointerId) return;
    event.preventDefault();
    const index = cellIndexFromPointer(event.clientX, event.clientY);
    if (index !== null) paintIndex(index);
  });

  const finish = (event) => {
    if (!stroke || (event && stroke.pointerId !== event.pointerId)) return;
    finishStroke();
  };
  window.addEventListener("pointerup", finish);
  window.addEventListener("pointercancel", finish);

  els.brushChar.addEventListener("input", () => {
    const characters = Array.from(els.brushChar.value);
    if (!characters.length) return;
    const character = characters[0];
    if (isUnsafeGlyph(character)) {
      els.brushChar.value = state.brushChar || "#";
      return;
    }
    state.brushChar = character;
    if (els.brushChar.value !== character) els.brushChar.value = character;
  });

  els.brushChar.addEventListener("blur", () => {
    if (!els.brushChar.value) {
      els.brushChar.value = state.brushChar || "#";
    }
  });
}

async function resetWorkspace() {
  if (!state.image) return;
  const editCount = state.edits.size;
  const confirmed = await ui.confirmAction({
    title: "Start with a new image?",
    message: editCount
      ? `This clears the current image, artwork, and ${editCount} manual edit${editCount === 1 ? "" : "s"}. Download anything you want to keep first.`
      : "This clears the current image and artwork. Your conversion settings stay. Download anything you want to keep first.",
    confirmLabel: "Clear image",
  });
  if (!confirmed) return;

  imageLoadToken += 1;
  clearScheduledRender();
  const oldUrl = state.image?.url;
  state.image = null;
  state.grid = null;
  state.lastCanvasMeta = null;
  state.canvasGrid = null;
  state.textGrid = null;
  state.edits.clear();
  history.clear();
  processedCache = null;
  state.viewMode = "canvas";
  state.compareEnabled = false;
  state.comparePosition = 50;
  state.editMode = false;
  state.dirty.grid = true;
  state.dirty.canvas = true;
  state.dirty.text = true;
  state.dirty.reprocess = true;

  els.outputCanvas.width = 0;
  els.outputCanvas.height = 0;
  els.canvasLayer.style.removeProperty("width");
  els.canvasLayer.style.removeProperty("height");
  els.canvasLayer.style.removeProperty("--compare-pos");
  els.textPreview.textContent = "";
  els.comparisonImage.hidden = true;
  els.comparisonImage.removeAttribute("src");
  els.fileInput.value = "";

  if (oldUrl) URL.revokeObjectURL(oldUrl);

  ui.setViewMode("canvas");
  ui.setEdit(false);
  ui.setCompare(false, 50);
  ui.setEditCount(0);
  ui.setHistoryState(false, false);
  ui.setImagePresent(false);
  ui.setSourceInfo(null);
  ui.clearStats();
  ui.setExportAvailability(false);
  ui.setProcessing(false);
  ui.setStatus("READY — Upload, drop, or paste an image to begin.", "ready");
  ui.toast("Workspace cleared. Settings preserved.", "info");
}

async function handleImageFile(file) {
  const validationError = validateImageFile(file);
  if (validationError) {
    showActionError(new Error(validationError), "IMAGE ERROR");
    return;
  }

  if (state.image && state.edits.size) {
    const confirmed = await ui.confirmAction({
      title: "Replace the current artwork?",
      message: `Loading a new image clears the current grid and ${state.edits.size} manual character edit${state.edits.size === 1 ? "" : "s"}.`,
      confirmLabel: "Load new image",
    });
    if (!confirmed) return;
  }

  const token = ++imageLoadToken;
  state.imageToken = token;
  ui.setProcessing(true);
  ui.setStatus(`LOADING — ${file.name || "image"}…`, "working");

  try {
    const loaded = await decodeImageFile(file);
    if (token !== imageLoadToken) {
      URL.revokeObjectURL(loaded.url);
      return;
    }

    clearScheduledRender();
    if (stroke) finishStroke();
    const oldUrl = state.image?.url;

    state.image = loaded;
    state.grid = null;
    state.lastCanvasMeta = null;
    state.canvasGrid = null;
    state.textGrid = null;
    state.edits.clear();
    history.clear();
    processedCache = null;
    state.viewMode = "canvas";
    state.compareEnabled = false;
    state.comparePosition = 50;
    state.editMode = false;
    state.dirty.grid = true;
    state.dirty.canvas = true;
    state.dirty.text = true;
    state.dirty.reprocess = true;

    els.outputCanvas.width = 0;
    els.outputCanvas.height = 0;
    els.canvasLayer.style.removeProperty("width");
    els.canvasLayer.style.removeProperty("height");
    els.textPreview.textContent = "";
    ui.setCompareImage(loaded.url, `Original source image: ${loaded.name}`);
    ui.setViewMode("canvas");
    ui.setCompare(false, 50);
    ui.setEdit(false);
    ui.setEditTool(state.editTool);
    ui.setBrushChar(state.brushChar);
    ui.setEditCount(0);
    ui.setHistoryState(false, false);
    ui.setImagePresent(true);
    ui.setSourceInfo(loaded);
    ui.setExportAvailability(false);
    ui.clearStats();
    ui.updateStats(null);
    updateTextToolbarValues();

    if (oldUrl) URL.revokeObjectURL(oldUrl);

    scheduleRender({ grid: true, reprocess: true, debounce: 0 });
    ui.setStatus(
      `LOADED — ${loaded.name} (${loaded.width}×${loaded.height})`,
      "success",
    );

    if (loaded.width * loaded.height > 24_000_000) {
      ui.toast("Large source image — processing is scaled to 1600px for reliability.", "warning", 4800);
    }
  } catch (error) {
    if (token !== imageLoadToken) return;
    showActionError(error, "IMAGE ERROR");
  }
}

function loadStoredCustomPresets() {
  try {
    const result = presets.loadStoredPresets();
    customPresets = result.presets;
    return result.warning;
  } catch (error) {
    customPresets = [];
    return `Custom presets could not be initialized: ${error.message}`;
  }
}

function persistCustomPresets(nextPresets) {
  customPresets = nextPresets;
  const result = presets.saveStoredPresets(customPresets);
  ui.renderCustomPresets(customPresets, state.customPresetSelection);
  if (!result.ok) ui.toast(result.error, "error", 5200);
  return result;
}

async function savePreset() {
  const name = await ui.openNameDialog({
    title: "Save custom preset",
    kicker: "CUSTOM PRESET",
    description: "Store the current conversion and appearance settings. Character edits and the source image are not saved.",
    submitLabel: "Save preset",
    validate: (value) => {
      const validation = presets.validatePresetName(value, customPresets);
      return validation.ok ? null : validation.error;
    },
  });
  if (!name) return;

  try {
    const next = presets.addCustomPreset(customPresets, name, state.settings);
    state.customPresetSelection = next[0].id;
    const result = persistCustomPresets(next);
    ui.setActiveBuiltIn(state.settings.charset);
    if (result.ok) {
      ui.toast(`Preset “${next[0].name}” saved.`, "success");
      ui.setStatus(`PRESET SAVED — “${next[0].name}”`, "success");
    } else {
      ui.setStatus("PRESET SAVED FOR THIS SESSION — browser storage failed", "warning");
    }
  } catch (error) {
    showActionError(error, "PRESET ERROR");
  }
}

async function renamePreset() {
  const id = els.customPresetSelect.value;
  const preset = presets.getCustomPreset(customPresets, id);
  if (!preset) {
    ui.toast("Select a custom preset first.", "warning");
    return;
  }
  const name = await ui.openNameDialog({
    title: "Rename custom preset",
    kicker: "CUSTOM PRESET",
    description: "The saved settings stay unchanged.",
    initialValue: preset.name,
    submitLabel: "Rename preset",
    validate: (value) => {
      const validation = presets.validatePresetName(value, customPresets, { excludeId: preset.id });
      return validation.ok ? null : validation.error;
    },
  });
  if (!name) return;
  try {
    const next = presets.renameCustomPreset(customPresets, preset.id, name);
    state.customPresetSelection = preset.id;
    const result = persistCustomPresets(next);
    if (result.ok) {
      const renamed = next.find((item) => item.id === preset.id);
      ui.toast("Preset renamed.", "success");
      ui.setStatus(`PRESET RENAMED — “${renamed?.name ?? name}”`, "success");
    } else {
      ui.setStatus("PRESET RENAMED FOR THIS SESSION — browser storage failed", "warning");
    }
  } catch (error) {
    showActionError(error, "PRESET ERROR");
  }
}

async function deletePreset() {
  const id = els.customPresetSelect.value;
  const preset = presets.getCustomPreset(customPresets, id);
  if (!preset) {
    ui.toast("Select a custom preset first.", "warning");
    return;
  }
  const confirmed = await ui.confirmAction({
    title: "Delete custom preset?",
    message: `“${preset.name}” will be removed from this browser. This cannot be undone.`,
    confirmLabel: "Delete preset",
  });
  if (!confirmed) return;
  try {
    const next = presets.deleteCustomPreset(customPresets, preset.id);
    state.customPresetSelection = "";
    const result = persistCustomPresets(next);
    if (result.ok) {
      ui.toast("Preset deleted.", "success");
      ui.setStatus(`PRESET DELETED — “${preset.name}”`, "success");
    } else {
      ui.setStatus("PRESET DELETED FOR THIS SESSION — browser storage failed", "warning");
    }
  } catch (error) {
    showActionError(error, "PRESET ERROR");
  }
}

function loadSelectedPreset() {
  const id = els.customPresetSelect.value;
  const preset = presets.getCustomPreset(customPresets, id);
  if (!preset) {
    ui.toast("Select a custom preset to load.", "warning");
    return;
  }
  state.customPresetSelection = preset.id;
  applyLoadedSettings(preset.settings);
  ui.setPresetSelection(preset.id);
  applyTextPreviewStyle(els.textPreview, state.settings);
  ui.toast(`Preset “${preset.name}” loaded.`, "success");
  ui.setStatus(`PRESET LOADED — “${preset.name}”`, "success");
}

function exportPresetFile() {
  if (!customPresets.length) {
    ui.toast("There are no custom presets to export.", "warning");
    return;
  }
  try {
    exporters.downloadText(
      presets.serializePresets(customPresets),
      "ascii-forge-presets.json",
      "application/json;charset=utf-8",
    );
    ui.toast(`Exported ${customPresets.length} custom preset${customPresets.length === 1 ? "" : "s"}.`, "success");
    ui.setStatus(`PRESETS EXPORTED — ${customPresets.length} saved locally`, "success");
  } catch (error) {
    showActionError(error, "PRESET EXPORT ERROR");
  }
}

async function importPresetFile(file) {
  if (!file) return;
  if (file.size > LIMITS.MAX_PRESET_FILE_BYTES) {
    els.presetFileInput.value = "";
    showActionError(new Error("Preset files are limited to 512 KB."), "IMPORT ERROR");
    return;
  }
  try {
    const text = await file.text();
    const parsed = presets.parsePresetFile(text);
    const merged = presets.mergeImportedPresets(customPresets, parsed.presets);
    if (!merged.accepted.length) {
      throw new Error(`Custom preset limit reached (${LIMITS.MAX_CUSTOM_PRESETS}). Delete a preset before importing.`);
    }
    state.customPresetSelection = merged.accepted[0].id;
    const saveResult = persistCustomPresets(merged.presets);
    const count = merged.accepted.length;
    const skipped = parsed.skipped + merged.skippedForLimit;
    const saveNote = saveResult.ok ? "" : " for this session";
    ui.toast(
      `Imported ${count} preset${count === 1 ? "" : "s"}${skipped ? ` · ${skipped} skipped` : ""}${saveNote}.`,
      saveResult.ok && !skipped ? "success" : "warning",
      5200,
    );
    ui.setStatus(
      `PRESETS IMPORTED — ${count} added${skipped ? `, ${skipped} skipped` : ""}${saveResult.ok ? "" : " · STORAGE FAILED"}`,
      saveResult.ok && !skipped ? "success" : "warning",
    );
  } catch (error) {
    showActionError(error, "IMPORT ERROR");
  } finally {
    els.presetFileInput.value = "";
  }
}

function applyBuiltInPreset(preset) {
  if (!updateSettings({ charset: preset.charset })) {
    state.customPresetSelection = "";
    ui.setPresetSelection("");
    ui.setActiveBuiltIn(preset.charset);
    return;
  }
  els.charSet.value = preset.charset;
  els.charSetNote.textContent = CHARSET_NOTE_DEFAULT;
  els.charSetNote.classList.remove("is-error");
  ui.updateCharSetMeta(preset.charset);
  ui.setActiveBuiltIn(preset.charset);
  state.customPresetSelection = "";
  ui.setPresetSelection("");
  ui.updateColorModeUI(state.settings);
  scheduleRender({ grid: true, debounce: 40 });
  if (state.image) ui.setStatus(`PRESET — ${preset.label} character set`, "ready");
}

async function copyAscii() {
  if (!state.image) return;
  if (!ensureFresh()) {
    showActionError(new Error("The ASCII grid is not ready yet."), "COPY ERROR");
    return;
  }
  try {
    const text = gridToText(state.grid);
    await exporters.copyTextToClipboard(text);
    ui.toast(`Copied ${state.grid.rows} lines · ${state.grid.cols} columns.`, "success");
    ui.setStatus(`COPIED — ${state.grid.rows} lines, ${state.grid.cols} columns`, "success");
  } catch (error) {
    showActionError(error, "COPY ERROR");
  }
}

async function exportArtwork(kind) {
  if (!state.image) return;
  if (!ensureFresh()) {
    showActionError(new Error("The ASCII grid is not ready yet."), "EXPORT ERROR");
    return;
  }

  const sourceName = state.image.name || "ascii-forge";
  const meta = {
    sourceName,
    editedCount: state.edits.size,
    generatedAt: state.grid.generatedAt,
  };

  try {
    let message = "";
    if (kind === "png" || kind === "jpg") {
      ui.setProcessing(true);
      await exporters.downloadCanvas(els.outputCanvas, kind, sourceName);
      ui.setProcessing(false);
      message = `${kind.toUpperCase()} downloaded.`;
    } else if (kind === "txt") {
      const text = exporters.buildPlainText(state.grid, {
        includeHeader: els.includeHeader.checked,
        meta,
        settings: state.settings,
      });
      exporters.downloadText(text, exporters.makeExportFilename(sourceName, "txt"), "text/plain;charset=utf-8");
      message = "Plain text downloaded.";
    } else if (kind === "svg") {
      const svg = exporters.buildSvg(state.grid, state.settings, { ...state.lastCanvasMeta, ...meta });
      exporters.downloadText(svg, exporters.makeExportFilename(sourceName, "svg"), "image/svg+xml;charset=utf-8");
      message = "Vector SVG downloaded.";
    } else if (kind === "html") {
      const html = exporters.buildHtml(state.grid, state.settings, { ...state.lastCanvasMeta, ...meta });
      exporters.downloadText(html, exporters.makeExportFilename(sourceName, "html"), "text/html;charset=utf-8");
      message = "Standalone HTML downloaded.";
    } else if (kind === "ansi") {
      const ansi = exporters.buildAnsi(state.grid, state.settings);
      exporters.downloadText(ansi, exporters.makeExportFilename(sourceName, "ansi"), "text/plain;charset=utf-8");
      message = "24-bit ANSI terminal file downloaded.";
    } else {
      throw new Error("Unknown export format.");
    }

    ui.toast(message, "success");
    ui.setStatus(`EXPORTED — ${message}`, "success");
  } catch (error) {
    ui.setProcessing(false);
    showActionError(error, "EXPORT ERROR");
  }
}

function primeFonts() {
  const weight = state.settings.bold ? 700 : 400;
  const spec = `${weight} 16px "${state.settings.font}"`;
  try {
    document.fonts.load(spec).catch(() => {});
  } catch {
    // Font loading is an enhancement; the declared fallbacks still render.
  }
}

function loadSelectedFont() {
  primeFonts();
  const weight = state.settings.bold ? 700 : 400;
  const spec = `${weight} 16px "${state.settings.font}"`;
  document.fonts.load(spec).then(() => {
    if (state.image && state.grid) scheduleRender({ debounce: 0 });
  }).catch(() => {});
}

function initKeyboardShortcuts() {
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (document.querySelector("dialog[open]")) return;
      if (els.sidebar.classList.contains("is-open")) {
        ui.closeMobilePanel();
        return;
      }
      if (state.editMode) {
        setEditMode(false);
        return;
      }
      if (state.compareEnabled) {
        setComparison(false);
        return;
      }
      return;
    }

    if (document.querySelector("dialog[open]")) return;
    const editable = isEditableElement(event.target);
    const key = event.key.toLowerCase();
    const modifier = event.ctrlKey || event.metaKey;

    if (event.key === "?" && !modifier && !event.altKey && !editable) {
      event.preventDefault();
      ui.openShortcuts();
      return;
    }

    if (event.altKey && !modifier && !event.shiftKey && !editable) {
      if (key === "c") {
        event.preventDefault();
        toggleComparison();
        return;
      }
      if (key === "e") {
        event.preventDefault();
        toggleEditMode();
        return;
      }
    }

    if (modifier && !event.shiftKey && key === "s" && !editable) {
      event.preventDefault();
      exportArtwork("png");
      return;
    }

    if (modifier && event.shiftKey && key === "c" && !editable) {
      event.preventDefault();
      copyAscii();
      return;
    }

    if (modifier && !event.shiftKey && key === "z" && !editable) {
      if (history.canUndo) {
        event.preventDefault();
        undoEdit();
      }
      return;
    }

    if (
      modifier
      && !editable
      && ((event.shiftKey && key === "z") || (!event.shiftKey && key === "y"))
    ) {
      if (history.canRedo) {
        event.preventDefault();
        redoEdit();
      }
    }
  });
}

function bindControls() {
  els.charSet.addEventListener("input", () => {
    const raw = els.charSet.value;
    const rawCharacters = Array.from(raw);
    const characters = rawCharacters.filter((character) => !isUnsafeGlyph(character));
    const hadUnsafe = characters.length !== rawCharacters.length;
    if (hadUnsafe) els.charSet.value = characters.join("");
    if (!characters.length) {
      els.charSetNote.textContent = hadUnsafe
        ? "Control and line-break characters are not supported."
        : "Enter at least one character for the ASCII mapping.";
      els.charSetNote.classList.add("is-error");
      return;
    }
    let charset = characters.slice(0, LIMITS.MAX_CHARSET_LENGTH).join("");
    if (characters.length > LIMITS.MAX_CHARSET_LENGTH) {
      els.charSet.value = charset;
      els.charSetNote.textContent = `Limited to ${LIMITS.MAX_CHARSET_LENGTH} glyphs.`;
      els.charSetNote.classList.add("is-error");
    } else if (hadUnsafe) {
      els.charSetNote.textContent = "Control and line-break characters are not supported.";
      els.charSetNote.classList.add("is-error");
    } else {
      els.charSetNote.textContent = CHARSET_NOTE_DEFAULT;
      els.charSetNote.classList.remove("is-error");
    }
    updateSettings({ charset });
    ui.updateCharSetMeta(charset);
    scheduleRender({ grid: true, debounce: 130 });
  });

  els.blockSize.addEventListener("input", () => {
    const value = Number(els.blockSize.value);
    els.blockSizeVal.textContent = String(value);
    els.resolutionMeta.textContent = `${value} px blocks`;
    updateSettings({ blockSize: value });
    scheduleRender({ grid: true, debounce: 55 });
  });

  els.brightness.addEventListener("input", () => {
    const value = Number(els.brightness.value);
    els.brightnessVal.textContent = value > 0 ? `+${value}` : String(value);
    updateSettings({ brightness: value });
    scheduleRender({ grid: true, reprocess: true, debounce: 65 });
  });

  els.contrast.addEventListener("input", () => {
    const value = Number(els.contrast.value);
    els.contrastVal.textContent = value > 0 ? `+${value}` : String(value);
    updateSettings({ contrast: value });
    scheduleRender({ grid: true, reprocess: true, debounce: 65 });
  });

  els.invertToggle.addEventListener("change", () => {
    updateSettings({ invert: els.invertToggle.checked });
    scheduleRender({ grid: true, debounce: 0 });
  });

  els.edgeToggle.addEventListener("change", () => {
    updateSettings({ edgeDetection: els.edgeToggle.checked });
    scheduleRender({ grid: true, reprocess: true, debounce: 0 });
  });

  els.boldToggle.addEventListener("change", () => {
    updateSettings({ bold: els.boldToggle.checked });
    applyTextPreviewStyle(els.textPreview, state.settings);
    scheduleRender({ debounce: 0 });
    loadSelectedFont();
  });

  els.fontSelect.addEventListener("change", () => {
    updateSettings({ font: els.fontSelect.value });
    applyTextPreviewStyle(els.textPreview, state.settings);
    scheduleRender({ debounce: 0 });
    loadSelectedFont();
  });

  els.colorModeGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mode]");
    if (!button) return;
    const mode = button.dataset.mode;
    if (!COLOR_MODE_IDS.includes(mode)) return;
    updateSettings({ colorMode: mode });
    ui.updateColorModeUI(state.settings);
    scheduleRender({ grid: true, debounce: 0 });
  });

  els.fgColor.addEventListener("input", () => {
    updateSettings({ fgColor: els.fgColor.value });
    scheduleRender({ grid: true, debounce: 25 });
  });

  els.bgColor.addEventListener("input", () => {
    updateSettings({ bgColor: els.bgColor.value });
    applyTextPreviewStyle(els.textPreview, state.settings);
    scheduleRender({ debounce: 25 });
  });

  for (const input of [els.gradientStart, els.gradientMid, els.gradientEnd]) {
    input.addEventListener("input", () => {
      updateSettings({
        gradientStart: els.gradientStart.value,
        gradientMid: els.gradientMid.value,
        gradientEnd: els.gradientEnd.value,
      });
      scheduleRender({ grid: true, debounce: 25 });
    });
  }

  els.textFontSize.addEventListener("input", () => {
    const value = Number(els.textFontSize.value);
    updateSettings({ textFontSize: value });
    els.textFontSizeVal.textContent = String(value);
    applyTextPreviewStyle(els.textPreview, state.settings);
  });

  els.textLineHeight.addEventListener("input", () => {
    const value = Number(els.textLineHeight.value);
    updateSettings({ textLineHeight: value });
    els.textLineHeightVal.textContent = value.toFixed(1);
    applyTextPreviewStyle(els.textPreview, state.settings);
  });

  els.canvasViewBtn.addEventListener("click", () => setViewMode("canvas"));
  els.textViewBtn.addEventListener("click", () => setViewMode("text"));
  els.compareBtn.addEventListener("click", toggleComparison);
  els.editBtn.addEventListener("click", toggleEditMode);
  els.undoBtn.addEventListener("click", undoEdit);
  els.redoBtn.addEventListener("click", redoEdit);
  els.clearEditsBtn.addEventListener("click", clearEdits);

  els.paintToolBtn.addEventListener("click", () => {
    state.editTool = "paint";
    ui.setEditTool("paint");
    els.brushChar.focus();
  });
  els.eraseToolBtn.addEventListener("click", () => {
    state.editTool = "erase";
    ui.setEditTool("erase");
    ui.focusCanvas();
  });

  els.copyBtn.addEventListener("click", copyAscii);
  els.copyTextBtn.addEventListener("click", copyAscii);
  els.pngBtn.addEventListener("click", () => exportArtwork("png"));
  els.jpgBtn.addEventListener("click", () => exportArtwork("jpg"));
  els.txtBtn.addEventListener("click", () => exportArtwork("txt"));
  els.svgBtn.addEventListener("click", () => exportArtwork("svg"));
  els.htmlBtn.addEventListener("click", () => exportArtwork("html"));
  els.ansiBtn.addEventListener("click", () => exportArtwork("ansi"));
  els.newImageBtn.addEventListener("click", resetWorkspace);

  els.customPresetSelect.addEventListener("change", () => {
    state.customPresetSelection = els.customPresetSelect.value;
    ui.updatePresetActions(state.customPresetSelection, customPresets.length > 0);
  });
  els.loadPresetBtn.addEventListener("click", loadSelectedPreset);
  els.savePresetBtn.addEventListener("click", savePreset);
  els.renamePresetBtn.addEventListener("click", renamePreset);
  els.deletePresetBtn.addEventListener("click", deletePreset);
  els.exportPresetsBtn.addEventListener("click", exportPresetFile);
  els.importPresetsBtn.addEventListener("click", () => {
    els.presetFileInput.value = "";
    els.presetFileInput.click();
  });
  els.presetFileInput.addEventListener("change", () => {
    const file = els.presetFileInput.files?.[0];
    if (file) importPresetFile(file);
  });

  els.toastRegion.addEventListener("click", (event) => {
    const toast = event.target.closest(".toast");
    if (toast) toast.remove();
  });
}

function initResizeHandling() {
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(() => {
      if (state.grid) scheduleFit();
    });
    observer.observe(els.stage);
    observer.observe(els.sidebar);
  }
  window.addEventListener("resize", () => {
    if (state.grid) scheduleFit();
  });
}

function init() {
  if (initialized) return;
  initialized = true;

  try {
    validateDom();
  } catch (error) {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<p role="alert" style="position:fixed;inset:0;z-index:20000;margin:0;padding:32px;background:#04060a;color:#ff6b82;font:14px monospace;">${error.message}</p>`,
    );
    throw error;
  }

  state.settings = sanitizeSettings(state.settings, createDefaultSettings());
  ui.initUI();

  const warning = loadStoredCustomPresets();
  ui.renderBuiltInPresets(applyBuiltInPreset);
  ui.renderCustomPresets(customPresets, state.customPresetSelection);
  ui.syncControls(state.settings);
  ui.setImagePresent(false);
  ui.setSourceInfo(null);
  ui.setViewMode("canvas");
  ui.setCompare(false, state.comparePosition);
  ui.setEdit(false);
  ui.setEditTool(state.editTool);
  ui.setBrushChar(state.brushChar);
  ui.setEditCount(0);
  ui.setHistoryState(false, false);
  ui.setExportAvailability(false);
  ui.clearStats();
  ui.updateTextToolbar(state.settings);
  applyTextPreviewStyle(els.textPreview, state.settings);

  bindControls();

  initImageLoader({
    fileInput: els.fileInput,
    openButtons: [els.uploadBtn, els.dropZone],
    dropOverlay: els.dropOverlay,
    onFile: handleImageFile,
    onError: (message) => showActionError(new Error(message), "IMAGE ERROR"),
  });

  initComparison();
  initEditing();
  initKeyboardShortcuts();
  initResizeHandling();
  primeFonts();

  document.fonts.ready.then(() => {
    if (state.image) scheduleRender({ debounce: 0 });
  }).catch(() => {});

  if (warning) {
    ui.toast(warning, "warning", 6000);
    ui.setStatus(`READY — ${warning}`, "warning");
  } else {
    ui.setStatus("READY — Upload, drop, or paste an image to begin.", "ready");
  }

  console.info(`ASCII.FORGE v${APP_VERSION} ready · client-side only`);
}

init();
