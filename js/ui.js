import { APP_VERSION, COLOR_MODES, COLOR_MODE_MAP, FONTS, clamp } from "./state.js";
import { els, $$ } from "./dom.js";
import { BUILTIN_PRESETS } from "./presets.js";

let initialized = false;
let nameDialogResolve = null;
let nameDialogValidate = null;
let lastFocusedBeforePanel = null;
let activeTab = "convert";

const TAB_ORDER = ["convert", "style", "export"];

function buttonLabel(button, text) {
  const label = button?.querySelector("span:not(.icon)");
  if (label) label.textContent = text;
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function setStatus(message, tone = "ready", right) {
  els.statusText.textContent = message;
  els.statusbar.dataset.tone = tone;
  if (right !== undefined) els.statusRight.textContent = right;
}

export function setProcessing(processing) {
  els.statusbar.classList.toggle("is-processing", Boolean(processing));
  els.processingLine.hidden = !processing;
  els.stage.setAttribute("aria-busy", String(Boolean(processing)));
}

export function toast(message, tone = "info", duration = 3400) {
  if (!message) return;
  const region = els.toastRegion;
  while (region.children.length >= 4) region.firstElementChild?.remove();
  const item = document.createElement("div");
  item.className = "toast";
  item.dataset.tone = tone;
  item.textContent = String(message);
  region.appendChild(item);
  window.setTimeout(() => {
    item.classList.add("is-leaving");
    window.setTimeout(() => item.remove(), 180);
  }, Math.max(1200, duration));
}

export function setTab(tabName, { focus = false } = {}) {
  if (!TAB_ORDER.includes(tabName)) return;
  activeTab = tabName;
  for (const name of TAB_ORDER) {
    const tab = els[`tab${name[0].toUpperCase()}${name.slice(1)}`];
    const panel = els[`panel${name[0].toUpperCase()}${name.slice(1)}`];
    const selected = name === tabName;
    tab.classList.toggle("is-active", selected);
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    panel.hidden = !selected;
    if (selected && focus) tab.focus();
  }
}

export function openMobilePanel() {
  if (window.matchMedia("(min-width: 861px)").matches) return;
  lastFocusedBeforePanel = document.activeElement;
  els.sidebar.classList.add("is-open");
  els.backdrop.hidden = false;
  els.controlsBtn.setAttribute("aria-expanded", "true");
  window.requestAnimationFrame(() => {
    const active = els.sidebar.querySelector(".panel-tab.is-active");
    (active || els.sidebar).focus?.({ preventScroll: true });
  });
}

export function closeMobilePanel({ restoreFocus = true } = {}) {
  if (!els.sidebar.classList.contains("is-open")) return;
  els.sidebar.classList.remove("is-open");
  els.backdrop.hidden = true;
  els.controlsBtn.setAttribute("aria-expanded", "false");
  if (restoreFocus && lastFocusedBeforePanel instanceof HTMLElement) {
    lastFocusedBeforePanel.focus({ preventScroll: true });
  }
  lastFocusedBeforePanel = null;
}

export function renderBuiltInPresets(onChoose) {
  els.presetGrid.replaceChildren();
  for (const preset of BUILTIN_PRESETS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preset-pill";
    button.dataset.presetId = preset.id;
    button.textContent = preset.label;
    button.title = `Character set: ${preset.charset}`;
    button.addEventListener("click", () => onChoose(preset));
    els.presetGrid.appendChild(button);
  }
}

export function setActiveBuiltIn(charset) {
  for (const button of $$(".preset-pill", els.presetGrid)) {
    const preset = BUILTIN_PRESETS.find((item) => item.id === button.dataset.presetId);
    button.classList.toggle("is-active", Boolean(preset && preset.charset === charset));
  }
}

export function updatePresetActions(selectedId, hasPresets) {
  const hasSelection = Boolean(selectedId);
  els.customPresetSelect.disabled = !hasPresets;
  els.loadPresetBtn.disabled = !hasSelection;
  els.renamePresetBtn.disabled = !hasSelection;
  els.deletePresetBtn.disabled = !hasSelection;
  els.exportPresetsBtn.disabled = !hasPresets;
}

export function renderCustomPresets(presets, selectedId = "") {
  const select = els.customPresetSelect;
  select.replaceChildren();

  if (!presets.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No custom presets";
    select.appendChild(option);
    select.value = "";
    updatePresetActions("", false);
    return;
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a preset…";
  select.appendChild(placeholder);

  for (const preset of presets) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.name;
    select.appendChild(option);
  }

  const validSelection = presets.some((preset) => preset.id === selectedId);
  select.value = validSelection ? selectedId : "";
  updatePresetActions(select.value, true);
}

export function setPresetSelection(id) {
  if (!els.customPresetSelect.disabled) els.customPresetSelect.value = id;
  updatePresetActions(id, !els.customPresetSelect.disabled);
}

export function updateCharSetMeta(charset) {
  const count = Array.from(charset || "").length;
  els.charSetMeta.textContent = pluralize(count, "glyph", "glyphs");
}

export function updateRangeLabels(settings) {
  els.blockSize.value = String(settings.blockSize);
  els.blockSizeVal.textContent = String(settings.blockSize);
  els.brightness.value = String(settings.brightness);
  els.brightnessVal.textContent = settings.brightness > 0 ? `+${settings.brightness}` : String(settings.brightness);
  els.contrast.value = String(settings.contrast);
  els.contrastVal.textContent = settings.contrast > 0 ? `+${settings.contrast}` : String(settings.contrast);
  els.textFontSize.value = String(settings.textFontSize);
  els.textFontSizeVal.textContent = String(settings.textFontSize);
  els.textLineHeight.value = String(settings.textLineHeight);
  els.textLineHeightVal.textContent = settings.textLineHeight.toFixed(1);
  els.resolutionMeta.textContent = `${settings.blockSize} px blocks`;
  updateCharSetMeta(settings.charset);
}

export function updateColorModeUI(settings) {
  const mode = COLOR_MODE_MAP[settings.colorMode] ?? COLOR_MODES[0];
  for (const button of $$(".color-mode-btn", els.colorModeGrid)) {
    const active = button.dataset.mode === mode.id;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  els.colorModeName.textContent = mode.label.toUpperCase();
  els.fgPickerField.hidden = !mode.usesForeground;
  els.colorPickerRow.classList.toggle("is-single", !mode.usesForeground);
  els.gradientFields.hidden = !mode.usesGradient;
  els.colorModeNote.textContent = mode.note;
  els.fgColor.value = settings.fgColor;
  els.bgColor.value = settings.bgColor;
  els.gradientStart.value = settings.gradientStart;
  els.gradientMid.value = settings.gradientMid;
  els.gradientEnd.value = settings.gradientEnd;
}

export function syncControls(settings) {
  els.charSet.value = settings.charset;
  els.invertToggle.checked = settings.invert;
  els.edgeToggle.checked = settings.edgeDetection;
  els.boldToggle.checked = settings.bold;
  els.fgColor.value = settings.fgColor;
  els.bgColor.value = settings.bgColor;
  els.gradientStart.value = settings.gradientStart;
  els.gradientMid.value = settings.gradientMid;
  els.gradientEnd.value = settings.gradientEnd;
  els.fontSelect.value = settings.font;
  updateRangeLabels(settings);
  updateColorModeUI(settings);
  setActiveBuiltIn(settings.charset);
}

export function setViewMode(mode) {
  const text = mode === "text";
  els.canvasViewBtn.classList.toggle("is-active", !text);
  els.canvasViewBtn.setAttribute("aria-pressed", String(!text));
  els.textViewBtn.classList.toggle("is-active", text);
  els.textViewBtn.setAttribute("aria-pressed", String(text));
  els.artwork.classList.toggle("is-text", text);
  els.canvasLayer.hidden = text;
  els.textPreviewWrap.hidden = !text;
  els.textToolbar.hidden = !text;
  if (text) els.textPreview.scrollTop = 0;
}

export function setCompareImage(url, alt = "Original source image") {
  if (!url) {
    els.comparisonImage.removeAttribute("src");
    return;
  }
  if (els.comparisonImage.getAttribute("src") !== url) {
    els.comparisonImage.src = url;
  }
  els.comparisonImage.alt = alt;
}

export function setComparePosition(position) {
  const value = clamp(Number(position) || 0, 0, 100);
  els.canvasLayer.style.setProperty("--compare-pos", `${value}%`);
  els.compareDivider.setAttribute("aria-valuenow", String(Math.round(value)));
}

export function setCompare(enabled, position = 50) {
  els.compareBtn.classList.toggle("is-active", enabled);
  els.compareBtn.setAttribute("aria-pressed", String(enabled));
  els.comparisonImage.hidden = !enabled;
  els.compareOverlay.hidden = !enabled;
  els.compareDivider.hidden = !enabled;
  els.canvasLayer.classList.toggle("is-comparing", enabled);
  setComparePosition(position);
}

export function setCompareAvailable(available) {
  els.compareBtn.disabled = !available;
}

export function setEdit(enabled) {
  els.editBtn.classList.toggle("is-active", enabled);
  els.editBtn.setAttribute("aria-pressed", String(enabled));
  els.editToolbar.hidden = !enabled;
  els.canvasLayer.classList.toggle("is-editing", enabled);
}

export function setEditTool(tool) {
  const erase = tool === "erase";
  els.paintToolBtn.classList.toggle("is-active", !erase);
  els.paintToolBtn.setAttribute("aria-pressed", String(!erase));
  els.eraseToolBtn.classList.toggle("is-active", erase);
  els.eraseToolBtn.setAttribute("aria-pressed", String(erase));
  els.brushChar.disabled = erase;
}

export function setBrushChar(character) {
  els.brushChar.value = character;
}

export function setEditCount(count) {
  els.editCount.textContent = pluralize(count, "edit");
  els.clearEditsBtn.disabled = count === 0;
}

export function setHistoryState(canUndo, canRedo) {
  els.undoBtn.disabled = !canUndo;
  els.redoBtn.disabled = !canRedo;
}

export function setEditAvailable(available) {
  els.editBtn.disabled = !available;
}

export function setExportAvailability(available) {
  els.copyBtn.disabled = !available;
  els.copyTextBtn.disabled = !available;
  els.pngBtn.disabled = !available;
  els.jpgBtn.disabled = !available;
  els.txtBtn.disabled = !available;
  els.svgBtn.disabled = !available;
  els.htmlBtn.disabled = !available;
  els.ansiBtn.disabled = !available;
}

export function setImagePresent(hasImage) {
  els.dropZone.hidden = hasImage;
  els.artwork.hidden = !hasImage;
  els.textViewBtn.disabled = !hasImage;
  setCompareAvailable(hasImage);
  setEditAvailable(hasImage);
  els.newImageBtn.disabled = !hasImage;
  buttonLabel(els.uploadBtn, hasImage ? "Replace image" : "Upload image");
  if (!hasImage) {
    setExportAvailability(false);
    setCompare(false, 50);
    setEdit(false);
    setHistoryState(false, false);
  }
}

export function setSourceInfo(image) {
  if (!image) {
    els.fileName.textContent = "No image loaded";
    els.fileName.removeAttribute("title");
    els.fileDims.textContent = "—";
    els.outputInfo.textContent = "—";
    buttonLabel(els.uploadBtn, "Upload image");
    return;
  }
  els.fileName.textContent = image.name;
  els.fileName.title = image.name;
  els.fileDims.textContent = `${image.width}×${image.height} · ${formatBytes(image.size)}`;
  buttonLabel(els.uploadBtn, "Replace image");
}

export function updateStats(grid, renderMeta) {
  if (!grid) {
    clearStats();
    return;
  }
  els.statCols.textContent = grid.cols.toLocaleString();
  els.statRows.textContent = grid.rows.toLocaleString();
  els.statChars.textContent = (grid.cols * grid.rows).toLocaleString();
  const totalMs = (renderMeta?.renderMs || 0) + (grid.generateMs || 0);
  els.statMs.textContent = String(Math.max(1, Math.round(totalMs)));
  els.gridBadge.textContent = `${grid.cols}×${grid.rows}${grid.capped ? " · CAPPED" : ""}`;
  els.gridBadge.classList.add("is-live");
  els.resolutionMeta.textContent = grid.capped
    ? `${grid.blockSize} px blocks · AUTO`
    : `${grid.blockSize} px blocks`;
  els.gridLimitNote.textContent = grid.capped
    ? `Auto-capped at ${grid.blockSize}px to keep the grid within 60,000 cells.`
    : "Larger blocks produce fewer, chunkier characters.";
  if (renderMeta) {
    els.outputInfo.textContent = `${grid.cols}×${grid.rows} chars · ${renderMeta.width}×${renderMeta.height}px`;
  }
}

export function clearStats() {
  for (const element of [els.statCols, els.statRows, els.statChars, els.statMs]) {
    element.textContent = "—";
  }
  els.gridBadge.textContent = "NO SIGNAL";
  els.gridBadge.classList.remove("is-live");
  els.resolutionMeta.textContent = "10 px blocks";
  els.gridLimitNote.textContent = "Larger blocks produce fewer, chunkier characters.";
  els.outputInfo.textContent = "—";
}

export function updateTextToolbar(settings) {
  els.textFontSize.value = String(settings.textFontSize);
  els.textFontSizeVal.textContent = String(settings.textFontSize);
  els.textLineHeight.value = String(settings.textLineHeight);
  els.textLineHeightVal.textContent = settings.textLineHeight.toFixed(1);
}

export function openShortcuts() {
  if (els.shortcutsDialog.open) return;
  els.shortcutsDialog.showModal();
  window.requestAnimationFrame(() => {
    els.shortcutsDialog.querySelector("[data-close-dialog]")?.focus();
  });
}

export function openNameDialog({
  title,
  kicker = "CUSTOM PRESET",
  description,
  initialValue = "",
  submitLabel = "Save preset",
  validate,
}) {
  if (els.presetDialog.open) return Promise.resolve(null);
  nameDialogValidate = validate;
  els.presetDialogTitle.textContent = title;
  els.presetDialogKicker.textContent = kicker;
  els.presetDialogDescription.textContent = description || "";
  els.presetName.value = initialValue;
  els.presetError.textContent = "";
  els.presetSubmitBtn.textContent = submitLabel;
  els.presetDialog.showModal();
  window.requestAnimationFrame(() => {
    els.presetName.focus();
    els.presetName.select();
  });

  return new Promise((resolve) => {
    nameDialogResolve = resolve;
  });
}

function closeNameDialog(value) {
  const resolve = nameDialogResolve;
  nameDialogResolve = null;
  nameDialogValidate = null;
  if (els.presetDialog.open) els.presetDialog.close(value ? "saved" : "cancel");
  resolve?.(value);
}

export function confirmAction({
  title = "Are you sure?",
  message = "",
  confirmLabel = "Confirm",
  danger = true,
}) {
  if (els.confirmDialog.open) els.confirmDialog.close("cancel");
  els.confirmTitle.textContent = title;
  els.confirmMessage.textContent = message;
  els.confirmOkBtn.textContent = confirmLabel;
  els.confirmOkBtn.className = danger ? "btn btn-danger" : "btn btn-primary";
  els.confirmDialog.returnValue = "";
  els.confirmDialog.showModal();

  window.requestAnimationFrame(() => {
    els.confirmDialog.querySelector('button[value="cancel"]')?.focus();
  });

  return new Promise((resolve) => {
    const onClose = () => {
      els.confirmDialog.removeEventListener("close", onClose);
      resolve(els.confirmDialog.returnValue === "confirm");
    };
    els.confirmDialog.addEventListener("close", onClose);
  });
}

export function focusCanvas() {
  els.outputCanvas.focus({ preventScroll: true });
}

export function initUI() {
  if (initialized) return;
  initialized = true;

  els.colorModeGrid.replaceChildren();
  for (const mode of COLOR_MODES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "color-mode-btn";
    button.dataset.mode = mode.id;
    button.textContent = mode.label;
    button.title = mode.note;
    button.setAttribute("aria-pressed", "false");
    els.colorModeGrid.appendChild(button);
  }

  els.fontSelect.replaceChildren();
  for (const font of FONTS) {
    const option = document.createElement("option");
    option.value = font.id;
    option.textContent = font.label;
    els.fontSelect.appendChild(option);
  }

  for (const tabName of TAB_ORDER) {
    const capital = `${tabName[0].toUpperCase()}${tabName.slice(1)}`;
    const tab = els[`tab${capital}`];
    tab.addEventListener("click", () => setTab(tabName));
    tab.addEventListener("keydown", (event) => {
      const index = TAB_ORDER.indexOf(tabName);
      let next = null;
      if (event.key === "ArrowRight") next = (index + 1) % TAB_ORDER.length;
      if (event.key === "ArrowLeft") next = (index - 1 + TAB_ORDER.length) % TAB_ORDER.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = TAB_ORDER.length - 1;
      if (next === null) return;
      event.preventDefault();
      setTab(TAB_ORDER[next], { focus: true });
    });
  }

  els.controlsBtn.addEventListener("click", openMobilePanel);
  els.sidebarHandle.addEventListener("click", () => closeMobilePanel());
  els.backdrop.addEventListener("click", () => closeMobilePanel());
  window.matchMedia("(min-width: 861px)").addEventListener("change", (event) => {
    if (event.matches) closeMobilePanel({ restoreFocus: false });
  });

  els.shortcutsBtn.addEventListener("click", openShortcuts);

  for (const button of $$("[data-close-dialog]")) {
    button.addEventListener("click", () => {
      const dialog = document.getElementById(button.dataset.closeDialog);
      if (dialog?.open) dialog.close("cancel");
    });
  }

  for (const dialog of $$("dialog.modal")) {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close("cancel");
    });
  }

  els.presetForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!nameDialogValidate) return;
    const value = els.presetName.value.trim();
    const error = nameDialogValidate(value);
    if (error) {
      els.presetError.textContent = error;
      els.presetName.focus();
      return;
    }
    closeNameDialog(value);
  });

  els.presetDialog.addEventListener("close", () => {
    if (!nameDialogResolve) return;
    const resolve = nameDialogResolve;
    nameDialogResolve = null;
    nameDialogValidate = null;
    resolve(null);
  });

  els.statusRight.textContent = `v${APP_VERSION} · CLIENT-SIDE`;
  setTab(activeTab);
}
