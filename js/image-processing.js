import { LIMITS, normalizeHex } from "./state.js";

function clampByte(value) {
  return value < 0 ? 0 : value > 255 ? 255 : value;
}

export function hslToRgb(hue, saturation = 90, lightness = 55) {
  const h = ((hue % 360) + 360) % 360 / 360;
  const s = saturation / 100;
  const l = lightness / 100;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t) => {
    let value = t;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };
  return {
    r: Math.round(channel(h + 1 / 3) * 255),
    g: Math.round(channel(h) * 255),
    b: Math.round(channel(h - 1 / 3) * 255),
  };
}

export function hexToRgb(hex, fallback = "#000000") {
  const normalized = normalizeHex(hex, fallback);
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

export function rgbToHex({ r, g, b }) {
  const to = (value) => clampByte(Math.round(value)).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function rgbToCss({ r, g, b }) {
  return `rgb(${clampByte(Math.round(r))}, ${clampByte(Math.round(g))}, ${clampByte(Math.round(b))})`;
}

export function packRgb({ r, g, b }, quantize = false) {
  if (!quantize) {
    return (clampByte(Math.round(r)) << 16) | (clampByte(Math.round(g)) << 8) | clampByte(Math.round(b));
  }
  return ((clampByte(Math.round(r)) & 0xf8) << 16)
    | ((clampByte(Math.round(g)) & 0xf8) << 8)
    | (clampByte(Math.round(b)) & 0xf8);
}

export function unpackRgb(packed) {
  return {
    r: (packed >> 16) & 255,
    g: (packed >> 8) & 255,
    b: packed & 255,
  };
}

export function packedToHex(packed) {
  return rgbToHex(unpackRgb(packed));
}

export function mixRgb(a, b, amount) {
  const t = Math.min(1, Math.max(0, amount));
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

export function mixThreeRgb(a, b, c, amount) {
  const t = Math.min(1, Math.max(0, amount));
  if (t < 0.5) return mixRgb(a, b, t * 2);
  return mixRgb(b, c, (t - 0.5) * 2);
}

export function relativeLuminance({ r, g, b }) {
  const channel = (value) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastTextColor(hex) {
  return relativeLuminance(hexToRgb(hex)) > 0.42 ? "#090d13" : "#eef6ff";
}

export function sobelFromGray(gray, width, height) {
  const edge = new Float32Array(width * height);
  let max = 0;

  for (let y = 1; y < height - 1; y += 1) {
    const row = y * width;
    const above = row - width;
    const below = row + width;
    for (let x = 1; x < width - 1; x += 1) {
      const tl = gray[above + x - 1];
      const top = gray[above + x];
      const tr = gray[above + x + 1];
      const left = gray[row + x - 1];
      const right = gray[row + x + 1];
      const bl = gray[below + x - 1];
      const bottom = gray[below + x];
      const br = gray[below + x + 1];

      const gx = -tl + tr - 2 * left + 2 * right - bl + br;
      const gy = -tl - 2 * top - tr + bl + 2 * bottom + br;
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      edge[row + x] = magnitude;
      if (magnitude > max) max = magnitude;
    }
  }

  if (max > 0) {
    const scale = 255 / max;
    for (let i = 0; i < edge.length; i += 1) edge[i] *= scale;
  }
  return edge;
}

export function processImage(imageElement, settings) {
  const started = performance.now();
  const sourceWidth = imageElement.naturalWidth || imageElement.width || 0;
  const sourceHeight = imageElement.naturalHeight || imageElement.height || 0;

  if (!sourceWidth || !sourceHeight) {
    throw new Error("The image has no readable dimensions.");
  }

  const scale = Math.min(1, LIMITS.WORK_MAX_DIMENSION / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("A 2D canvas context is unavailable in this browser.");

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, width, height);
  context.drawImage(imageElement, 0, 0, width, height);

  let imageData;
  try {
    imageData = context.getImageData(0, 0, width, height);
  } catch {
    throw new Error("The image pixels could not be read. Try a PNG or JPG file.");
  }

  const data = imageData.data;
  const pixelCount = width * height;
  const gray = new Float32Array(pixelCount);
  const brightnessFactor = 1 + settings.brightness / 100;
  const contrastFactor = settings.contrast >= 0
    ? 1 + (settings.contrast / 100) * 1.8
    : 1 + (settings.contrast / 100) * 0.8;

  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    const alpha = data[offset + 3] / 255;

    // Transparent pixels are composited over black for stable luminance mapping.
    let r = data[offset] * alpha;
    let g = data[offset + 1] * alpha;
    let b = data[offset + 2] * alpha;

    r = (r * brightnessFactor - 128) * contrastFactor + 128;
    g = (g * brightnessFactor - 128) * contrastFactor + 128;
    b = (b * brightnessFactor - 128) * contrastFactor + 128;

    r = clampByte(r);
    g = clampByte(g);
    b = clampByte(b);

    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
    gray[index] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  const edge = settings.edgeDetection ? sobelFromGray(gray, width, height) : null;

  return {
    width,
    height,
    sourceWidth,
    sourceHeight,
    sourceAspectRatio: sourceWidth / sourceHeight,
    scale,
    data,
    gray,
    edge,
    elapsed: performance.now() - started,
  };
}
