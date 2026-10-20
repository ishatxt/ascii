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
const TERMINAL_SHADES = ["#00ff94", "#00d16e", "#009d4f", "#006934"].map((hex) => packRgb(hexToRgb(hex)));
const AMBER_SHADES = ["#ffd37a", "#ffb443", "#d98616", "#925200"].map((hex) => packRgb(hexToRgb(hex)));

export function resolveGridDimensions(width, height, requestedBlockSize) {
  const desired = clamp(
    Math.round(Number(requestedBlockSize) || 10),
    LIMITS.MIN_BLOCK_SIZE,
    LIMITS.MAX_BLOCK_SIZE,
  );
  let blockSize = desired;
  let cols = 1;
  let rows = 1;

  for (let guard = 0; guard < 1000; guard += 1) {
    cols = Math.max(1, Math.floor(width / blockSize));
    rows = Math.max(1, Math.floor(height / blockSize));
    if (
      cols <= LIMITS.MAX_GRID_COLS
      && rows <= LIMITS.MAX_GRID_ROWS
      && cols * rows <= LIMITS.MAX_GRID_CELLS
    ) {
      return { cols, rows, blockSize, capped: blockSize !== desired };
    }
    blockSize += 1;
  }

  throw new Error("Could not resolve a safe ASCII grid for this image.");
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

export function generateAsciiGrid(processed, settings) {
  const started = performance.now();
  const { width, height, data, gray, edge } = processed;

  if (!width || !height || !data) {
    throw new Error("Cannot generate ASCII art from an empty image.");
  }

  const { cols, rows, blockSize, capped } = resolveGridDimensions(width, height, settings.blockSize);
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

  for (let row = 0; row < rows; row += 1) {
    const yStart = row * blockSize;
    const yEnd = Math.min(yStart + blockSize, height);
    const cellRow = row * cols;

    for (let col = 0; col < cols; col += 1) {
      const xStart = col * blockSize;
      const xEnd = Math.min(xStart + blockSize, width);
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
