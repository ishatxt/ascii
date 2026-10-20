import { FONTS } from "./state.js";
import { gridToText } from "./ascii-engine.js";
import { contrastTextColor, packedToHex } from "./image-processing.js";

const DEFAULT_CELL_ASPECT = 0.6;
const MEASURE_FONT_SIZE = 16;

export function getFontStack(fontId) {
  return FONTS.find((font) => font.id === fontId)?.stack ?? FONTS[0].stack;
}

function fontSpecFor(settings, fontSize) {
  const weight = settings.bold ? 700 : 400;
  return `${weight} ${fontSize}px ${getFontStack(settings.font)}`;
}

function measureCharWidth(context, fontSize, charset = "") {
  const sampleCharacters = new Set(["M", "W", "█", ...Array.from(charset || " ")]);
  let charWidth = context.measureText("M").width || fontSize * DEFAULT_CELL_ASPECT;
  for (const character of sampleCharacters) {
    const measured = context.measureText(character).width;
    if (measured > charWidth) charWidth = measured;
  }
  return Math.max(1, Math.ceil(charWidth * 100) / 100);
}

/**
 * Return the selected font's character-cell aspect ratio (advance width
 * divided by line height). Grid generation uses this so the number of rows
 * compensates for monospace glyphs being taller than they are wide.
 */
export function getFontCellAspect(settings, {
  fontSize = MEASURE_FONT_SIZE,
  charset = settings?.charset || "",
} = {}) {
  if (typeof document === "undefined") return DEFAULT_CELL_ASPECT;

  const size = Math.max(1, Number(fontSize) || MEASURE_FONT_SIZE);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return DEFAULT_CELL_ASPECT;

  context.font = fontSpecFor(settings, size);
  const charWidth = measureCharWidth(context, size, charset);
  return charWidth / size;
}

function cellColor(grid, index) {
  if (grid.flatColor) return grid.flatColor;
  if (grid.colors) return packedToHex(grid.colors[index]);
  return "#ffffff";
}

function applyFont(ctx, spec) {
  ctx.font = spec;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

export function renderCanvas(grid, settings, canvas, options = {}) {
  const started = performance.now();
  if (!grid || !canvas) throw new Error("No ASCII grid is available to render.");
  if (!grid.cols || !grid.rows) throw new Error("The ASCII grid has invalid dimensions.");

  const context = canvas.getContext("2d");
  if (!context) throw new Error("A 2D canvas context is unavailable in this browser.");

  // Each character represents a source cell of `cellWidth` x `cellHeight`.
  // Choose a font size whose advance width matches that cell width, and use
  // the matching line height, so the internal canvas keeps the source's
  // proportions instead of being squashed by narrow monospace glyphs.
  const cellAspect = getFontCellAspect(settings, { charset: grid.charset });
  const sourceCellWidth = grid.workWidth && grid.cols
    ? grid.workWidth / grid.cols
    : Math.max(1, grid.blockSize);
  const fontSize = Math.max(1, Math.min(512, sourceCellWidth / cellAspect));
  const spec = fontSpecFor(settings, fontSize);
  applyFont(context, spec);

  const charWidth = measureCharWidth(context, fontSize, grid.charset);
  const lineHeight = fontSize;

  const width = Math.max(1, Math.ceil(grid.cols * charWidth));
  const height = Math.max(1, Math.ceil(grid.rows * lineHeight));
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = settings.bgColor;
  ctx.fillRect(0, 0, width, height);
  applyFont(ctx, spec);

  const colorCache = new Map();
  const resolveColor = (packed) => {
    let css = colorCache.get(packed);
    if (!css) {
      css = packedToHex(packed);
      colorCache.set(packed, css);
    }
    return css;
  };

  if (grid.flatColor) {
    ctx.fillStyle = grid.flatColor;
    if (grid.glow) {
      ctx.shadowColor = grid.flatColor;
      ctx.shadowBlur = Math.max(2, fontSize * 0.34);
    }

    for (let row = 0; row < grid.rows; row += 1) {
      const start = row * grid.cols;
      const line = grid.chars.slice(start, start + grid.cols).join("");
      if (line.trim().length) {
        ctx.fillText(line, 0, row * lineHeight);
      }
    }
    ctx.shadowBlur = 0;
  } else {
    for (let row = 0; row < grid.rows; row += 1) {
      const y = row * lineHeight;
      const start = row * grid.cols;
      let run = "";
      let runColor = null;
      let runStart = 0;

      const flush = () => {
        if (run && runColor) ctx.fillText(run, runStart * charWidth, y);
        run = "";
        runColor = null;
      };

      for (let col = 0; col < grid.cols; col += 1) {
        const index = start + col;
        const character = grid.chars[index];
        if (character === " " || character === "\u00a0") {
          flush();
          continue;
        }
        const css = resolveColor(grid.colors ? grid.colors[index] : 0xffffff);
        if (!run) {
          runStart = col;
          runColor = css;
          ctx.fillStyle = css;
        } else if (css !== runColor) {
          flush();
          runStart = col;
          runColor = css;
          ctx.fillStyle = css;
        }
        run += character;
      }
      flush();
    }
  }

  if (options.showEdits && options.editedIndices?.size) {
    const markerColor = "rgba(255, 79, 216, 0.9)";
    ctx.fillStyle = markerColor;
    let drawn = 0;
    for (const index of options.editedIndices.keys()) {
      if (drawn >= 5000) break;
      if (index < 0 || index >= grid.chars.length) continue;
      const col = index % grid.cols;
      const row = Math.floor(index / grid.cols);
      ctx.fillRect(col * charWidth, row * lineHeight, Math.max(2, charWidth), 1);
      drawn += 1;
    }
  }

  return {
    width,
    height,
    charWidth,
    lineHeight,
    fontSize,
    fontSpec: spec,
    baseline: fontSize * 0.8,
    renderMs: performance.now() - started,
  };
}

export function paintCell(canvas, grid, settings, index, meta, options = {}) {
  if (!grid || !canvas || !meta) return;
  if (!Number.isInteger(index) || index < 0 || index >= grid.chars.length) return;
  if (meta.width !== canvas.width || meta.height !== canvas.height) return;

  const ctx = canvas.getContext("2d");
  const col = index % grid.cols;
  const row = Math.floor(index / grid.cols);
  const x = col * meta.charWidth;
  const y = row * meta.lineHeight;

  ctx.fillStyle = settings.bgColor;
  ctx.fillRect(x, y, meta.charWidth + 0.5, meta.lineHeight + 0.5);
  applyFont(ctx, meta.fontSpec);
  ctx.shadowBlur = 0;

  const character = grid.chars[index];
  if (character !== " " && character !== "\u00a0") {
    ctx.fillStyle = cellColor(grid, index);
    if (grid.glow) {
      ctx.shadowColor = grid.flatColor;
      ctx.shadowBlur = Math.max(2, meta.fontSize * 0.34);
    }
    ctx.fillText(character, x, y);
    ctx.shadowBlur = 0;
  }

  if (options.showEdits && options.editedIndices?.has(index)) {
    ctx.fillStyle = "rgba(255, 79, 216, 0.9)";
    ctx.fillRect(x, y, Math.max(2, meta.charWidth), 1);
  }
}

export function applyTextPreviewStyle(pre, settings) {
  pre.style.fontFamily = getFontStack(settings.font);
  pre.style.fontSize = `${settings.textFontSize}px`;
  pre.style.lineHeight = String(settings.textLineHeight);
  pre.style.fontWeight = settings.bold ? "700" : "400";
  pre.style.background = settings.bgColor;
  pre.style.color = contrastTextColor(settings.bgColor);
}

export function renderTextPreview(grid, settings, pre) {
  if (!grid || !pre) return "";
  const text = gridToText(grid);
  pre.textContent = text;
  applyTextPreviewStyle(pre, settings);
  return text;
}
