import { LIMITS, COLOR_MODE_MAP, clamp } from "./state.js";
import {
  hexToRgb,
  hslToRgb,
  mixThreeRgb,
  packedToHex,
  packRgb,
} from "./image-processing.js";

const ALPHA_BLANK_THRESHOLD = 12;
const MONO_COLOR = "#f2f6ff";
const DEFAULT_CELL_ASPECT = 0.6;
const TERMINAL_SHADES = ["#00ff94", "#00d16e", "#009d4f", "#006934"].map((hex) => packRgb(hexToRgb(hex)));
const AMBER_SHADES = ["#ffd37a", "#ffb443", "#d98616", "#925200"].map((hex) => packRgb(hexToRgb(hex)));

/**
 * Build a grid whose rendered character cells keep the source proportions.
 * `cellAspect` is the selected font's character advance divided by its line
 * height. Monospace glyphs are taller than they are wide, so a square source
 * region cannot be represented by a square character cell.
 */
function gridDimensionsForBlock(width, height, blockSize, cellAspect) {
  let cols = Math.max(1, Math.round(width / blockSize));
  let rows = Math.max(1, Math.round(cols * (height / width) * cellAspect));

  // Rebalance columns after the integer row rounding so the character grid
  // keeps the source aspect ratio instead of accumulating distortion.
  const balancedCols = Math.max(1, Math.round(rows * (width / height) / cellAspect));
  if (balancedCols <= LIMITS.MAX_GRID_COLS) cols = balancedCols;

  return {
    cols: Math.min(width, cols),
    rows: Math.min(height, rows),
  };
}

export function resolveGridDimensions(width, height, requestedBlockSize, cellAspect = DEFAULT_CELL_ASPECT) {
  const desired = clamp(
    Math.round(Number(requestedBlockSize) || 10),
    LIMITS.MIN_BLOCK_SIZE,
    LIMITS.MAX_BLOCK_SIZE,
  );
  const numericAspect = Number(cellAspect);
  const aspect = clamp(
    Number.isFinite(numericAspect) && numericAspect > 0 ? numericAspect : DEFAULT_CELL_ASPECT,
    0.1,
    4,
  );
  let blockSize = desired;
  let previousCols = -1;
  let previousRows = -1;

  for (let guard = 0; guard < 1000; guard += 1) {
    const { cols, rows } = gridDimensionsForBlock(width, height, blockSize, aspect);
    const withinLimits = cols <= LIMITS.MAX_GRID_COLS
      && rows <= LIMITS.MAX_GRID_ROWS
      && cols * rows <= LIMITS.MAX_GRID_CELLS;

    if (withinLimits) {
      return {
        cols,
        rows,
        blockSize,
        cellAspect: aspect,
        cellWidth: width / cols,
        cellHeight: height / rows,
        capped: blockSize !== desired,
      };
    }

    // Some extreme aspect ratios cannot be improved by increasing the block
    // size (for example a one-column image). Stop rather than looping forever.
    if (cols === previousCols && rows === previousRows) break;
    previousCols = cols;
    previousRows = rows;
    blockSize += 1;
  }

  // Safety fallback for pathological images: clamp to the published limits.
  const { cols, rows } = gridDimensionsForBlock(width, height, blockSize, aspect);
  const safeCols = Math.max(1, Math.min(cols, LIMITS.MAX_GRID_COLS, width));
  const safeRows = Math.max(
    1,
    Math.min(rows, LIMITS.MAX_GRID_ROWS, height, Math.floor(LIMITS.MAX_GRID_CELLS / safeCols)),
  );

  return {
    cols: safeCols,
    rows: safeRows,
    blockSize,
    cellAspect: aspect,
    cellWidth: width / safeCols,
    cellHeight: height / safeRows,
    capped: true,
  };
}

export function getCharacterSet(settings) {
  const characters = Array.from(settings.charset || " ");
  return settings.invert ? characters.slice().reverse() : characters;
}

function shadeFor(luminance, shades) {
  const index = Math.min(shades.length - 1, Math.max(0, Math.floor((luminance / 255) * shades.length)));
  return shades[index];
}

function colorForCell(mode, settings, averages) {
  const { r, g, b, tone, col, cols, row, rows } = averages;

  switch (mode) {
    case "original":
      return packRgb({ r, g, b }, true);
    case "grayscale": {
      const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      return packRgb({ r: gray, g: gray, b: gray }, true);
    }
    case "gradient": {
      const color = mixThreeRgb(
        hexToRgb(settings.gradientStart),
        hexToRgb(settings.gradientMid),
        hexToRgb(settings.gradientEnd),
        tone / 255,
      );
      return packRgb(color, true);
    }
    case "terminal":
      return shadeFor(tone, TERMINAL_SHADES);
    case "amber":
      return shadeFor(tone, AMBER_SHADES);
    case "rainbow": {
      const hue = (col / Math.max(1, cols)) * 300 + (row / Math.max(1, rows)) * 80 + tone * 0.18;
      return packRgb(hslToRgb(hue, 88, 58), true);
    }
    default:
      return packRgb({ r, g, b });
  }
}

export function generateAsciiGrid(processed, settings, options = {}) {
  const { cellAspect = DEFAULT_CELL_ASPECT } = options || {};
  const started = performance.now();
  const { width, height, data, gray, edge } = processed;

  if (!width || !height || !data) {
    throw new Error("Cannot generate ASCII art from an empty image.");
  }

  const {
    cols,
    rows,
    blockSize,
    cellAspect: resolvedAspect,
    cellWidth,
    cellHeight,
    capped,
  } = resolveGridDimensions(width, height, settings.blockSize, cellAspect);
  const characters = getCharacterSet(settings);
  const characterCount = characters.length;
  const mode = COLOR_MODE_MAP[settings.colorMode] ? settings.colorMode : "neon";
  const isFlat = mode === "neon" || mode === "mono" || mode === "custom";
  const flatColor = mode === "mono"
    ? MONO_COLOR
    : mode === "custom" || mode === "neon"
      ? settings.fgColor
      : null;
  const chars = new Array(cols * rows);
  const colors = isFlat ? null : new Uint32Array(cols * rows);
  let nonSpace = 0;

  // Sample the full source edge-to-edge. Cell boundaries are derived from the
  // grid dimensions so the last row/column never leaves a missing strip.
  const columnEdges = new Array(cols + 1);
  for (let col = 0; col <= cols; col += 1) {
    columnEdges[col] = Math.floor((col * width) / cols);
  }
  const rowEdges = new Array(rows + 1);
  for (let row = 0; row <= rows; row += 1) {
    rowEdges[row] = Math.floor((row * height) / rows);
  }

  for (let row = 0; row < rows; row += 1) {
    const yStart = rowEdges[row];
    const yEnd = Math.max(yStart + 1, rowEdges[row + 1]);
    const cellRow = row * cols;

    for (let col = 0; col < cols; col += 1) {
      const xStart = columnEdges[col];
      const xEnd = Math.max(xStart + 1, columnEdges[col + 1]);
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let graySum = 0;
      let edgeSum = 0;
      let alphaSum = 0;
      let samples = 0;

      for (let y = yStart; y < yEnd; y += 1) {
        let pixelIndex = y * width + xStart;
        for (let x = xStart; x < xEnd; x += 1) {
          const offset = pixelIndex * 4;
          rSum += data[offset];
          gSum += data[offset + 1];
          bSum += data[offset + 2];
          alphaSum += data[offset + 3];
          graySum += gray[pixelIndex];
          if (edge) edgeSum += edge[pixelIndex];
          samples += 1;
          pixelIndex += 1;
        }
      }

      const index = cellRow + col;

      if (!samples) {
        chars[index] = " ";
        if (colors) colors[index] = 0;
        continue;
      }

      const alpha = alphaSum / samples;
      const averageR = rSum / samples;
      const averageG = gSum / samples;
      const averageB = bSum / samples;
      const averageGray = graySum / samples;
      const edgeMagnitude = edge ? edgeSum / samples : 0;
      const tone = edge ? 255 - edgeMagnitude : averageGray;

      let character = " ";
      if (alpha >= ALPHA_BLANK_THRESHOLD) {
        const characterIndex = clamp(
          Math.floor((tone / 255) * (characterCount - 1)),
          0,
          characterCount - 1,
        );
        character = characters[characterIndex];
      }

      chars[index] = character;
      if (character !== " " && character !== "\u00a0") nonSpace += 1;

      if (colors) {
        colors[index] = colorForCell(mode, settings, {
          r: averageR,
          g: averageG,
          b: averageB,
          tone,
          col,
          cols,
          row,
          rows,
        });
      }
    }
  }

  return {
    cols,
    rows,
    chars,
    colors,
    flatColor,
    colorMode: mode,
    glow: mode === "neon",
    charset: settings.charset,
    font: settings.font,
    bold: settings.bold,
    blockSize,
    requestedBlockSize: settings.blockSize,
    cellAspect: resolvedAspect,
    cellWidth,
    cellHeight,
    aspectRatio: width / height,
    sourceAspectRatio: processed.sourceWidth / processed.sourceHeight,
    capped,
    sourceWidth: processed.sourceWidth,
    sourceHeight: processed.sourceHeight,
    workWidth: width,
    workHeight: height,
    nonSpace,
    generatedAt: Date.now(),
    generateMs: performance.now() - started,
  };
}

export function applyEdits(grid, edits) {
  if (!grid || !edits || !edits.size) return 0;
  let applied = 0;
  for (const [index, character] of edits.entries()) {
    if (Number.isInteger(index) && index >= 0 && index < grid.chars.length) {
      grid.chars[index] = character;
      applied += 1;
    }
  }
  return applied;
}

export function gridToRows(grid) {
  if (!grid) return [];
  const rows = new Array(grid.rows);
  for (let row = 0; row < grid.rows; row += 1) {
    const start = row * grid.cols;
    rows[row] = grid.chars.slice(start, start + grid.cols).join("");
  }
  return rows;
}

export function gridToText(grid) {
  return gridToRows(grid).join("\n");
}

export function getCellColor(grid, index) {
  if (grid.flatColor) return grid.flatColor;
  if (grid.colors) return packedToHex(grid.colors[index]);
  return "#ffffff";
}
