export const APP_VERSION = "3.0.0";
export const STORAGE_KEY = "asciiforge.customPresets.v1";

export const LIMITS = Object.freeze({
  MAX_FILE_BYTES: 40 * 1024 * 1024,
  MAX_SOURCE_DIMENSION: 16384,
  MAX_SOURCE_PIXELS: 100_000_000,
  WORK_MAX_DIMENSION: 1600,
  MAX_GRID_CELLS: 60_000,
  MAX_GRID_COLS: 480,
  MAX_GRID_ROWS: 480,
  MIN_BLOCK_SIZE: 2,
  MAX_BLOCK_SIZE: 40,
  MAX_CHARSET_LENGTH: 64,
  MAX_PRESET_FILE_BYTES: 512 * 1024,
  MAX_CUSTOM_PRESETS: 100,
});

export const COLOR_MODES = Object.freeze([
  {
    id: "neon",
    label: "Neon",
    usesForeground: true,
    usesGradient: false,
    note: "Neon uses the foreground color with a soft phosphor glow.",
  },
  {
    id: "original",
    label: "Original",
    usesForeground: false,
    usesGradient: false,
    note: "Original samples the image color for every character. Background appears behind blank cells.",
  },
  {
    id: "mono",
    label: "Mono",
    usesForeground: false,
    usesGradient: false,
    note: "Mono renders a fixed off-white character set over the selected background.",
  },
  {
    id: "grayscale",
    label: "Grayscale",
    usesForeground: false,
    usesGradient: false,
    note: "Grayscale colors each character from its sampled luminance.",
  },
  {
    id: "custom",
    label: "Custom",
    usesForeground: true,
    usesGradient: false,
    note: "Custom applies one foreground color to every visible character.",
  },
  {
    id: "gradient",
    label: "Gradient",
    usesForeground: false,
    usesGradient: true,
    note: "Gradient maps luminance across three configurable color stops.",
  },
  {
    id: "terminal",
    label: "Terminal",
    usesForeground: false,
    usesGradient: false,
    note: "Terminal uses a fixed phosphor-green shade palette over the selected background.",
  },
  {
    id: "amber",
    label: "Amber CRT",
    usesForeground: false,
    usesGradient: false,
    note: "Amber CRT uses a warm amber shade palette over the selected background.",
  },
  {
    id: "rainbow",
    label: "Rainbow",
    usesForeground: false,
    usesGradient: false,
    note: "Rainbow assigns a hue from the character's position and luminance.",
  },
]);

export const COLOR_MODE_IDS = Object.freeze(COLOR_MODES.map((mode) => mode.id));
export const COLOR_MODE_MAP = Object.freeze(
  Object.fromEntries(COLOR_MODES.map((mode) => [mode.id, mode])),
);

export const FONTS = Object.freeze([
  {
    id: "JetBrains Mono",
    label: "JetBrains Mono",
    stack: '"JetBrains Mono", "Cascadia Code", "Courier New", monospace',
  },
  {
    id: "Courier New",
    label: "Courier New",
    stack: '"Courier New", Courier, monospace',
  },
  {
    id: "Lucida Console",
    label: "Lucida Console",
    stack: '"Lucida Console", Monaco, monospace',
  },
  {
    id: "monospace",
    label: "System Monospace",
    stack: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
  },
]);

export const FONT_IDS = Object.freeze(FONTS.map((font) => font.id));

export const DEFAULT_SETTINGS = Object.freeze({
  charset: "@#S%?*+;:,. ",
  blockSize: 10,
  colorMode: "neon",
  fgColor: "#00ff88",
  bgColor: "#000000",
  gradientStart: "#00ff88",
  gradientMid: "#00c8ff",
  gradientEnd: "#ff2fff",
  brightness: 0,
  contrast: 0,
  invert: false,
  edgeDetection: false,
  bold: false,
  font: "JetBrains Mono",
  textFontSize: 12,
  textLineHeight: 1.2,
});

const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const UNSAFE_GLYPH = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

export function isUnsafeGlyph(value) {
  return typeof value === "string" && UNSAFE_GLYPH.test(value);
}

export function createDefaultSettings() {
  return { ...DEFAULT_SETTINGS };
}

export function normalizeHex(value, fallback = "#000000") {
  if (typeof value !== "string") return fallback;
  let hex = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(hex)) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return /^#[0-9a-f]{6}$/.test(hex) ? hex : fallback;
}

function numberOr(value, fallback) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function sanitizeSettings(raw, base = DEFAULT_SETTINGS) {
  const input = raw && typeof raw === "object" ? raw : {};
  const output = {};

  output.charset = typeof input.charset === "string"
    ? Array.from(input.charset)
      .filter((character) => !isUnsafeGlyph(character))
      .slice(0, LIMITS.MAX_CHARSET_LENGTH)
      .join("")
    : base.charset;
  if (!output.charset.length) output.charset = base.charset;

  output.blockSize = Math.round(clamp(
    numberOr(input.blockSize, base.blockSize),
    LIMITS.MIN_BLOCK_SIZE,
    LIMITS.MAX_BLOCK_SIZE,
  ));

  output.colorMode = COLOR_MODE_IDS.includes(input.colorMode) ? input.colorMode : base.colorMode;

  output.fgColor = normalizeHex(input.fgColor, base.fgColor);
  output.bgColor = normalizeHex(input.bgColor, base.bgColor);
  output.gradientStart = normalizeHex(input.gradientStart, base.gradientStart);
  output.gradientMid = normalizeHex(input.gradientMid, base.gradientMid);
  output.gradientEnd = normalizeHex(input.gradientEnd, base.gradientEnd);

  output.brightness = Math.round(clamp(numberOr(input.brightness, base.brightness), -100, 100));
  output.contrast = Math.round(clamp(numberOr(input.contrast, base.contrast), -100, 100));

  output.invert = typeof input.invert === "boolean" ? input.invert : base.invert;
  output.edgeDetection = typeof input.edgeDetection === "boolean" ? input.edgeDetection : base.edgeDetection;
  output.bold = typeof input.bold === "boolean" ? input.bold : base.bold;

  output.font = FONT_IDS.includes(input.font) ? input.font : base.font;

  output.textFontSize = Math.round(clamp(numberOr(input.textFontSize, base.textFontSize), 8, 24));
  output.textLineHeight = Math.round(
    clamp(numberOr(input.textLineHeight, base.textLineHeight), 1, 2.2) * 10,
  ) / 10;

  return output;
}

export function settingsEqual(a, b) {
  if (!a || !b) return false;
  return SETTING_KEYS.every((key) => a[key] === b[key]);
}

export function settingsSnapshot(settings) {
  return sanitizeSettings(settings, createDefaultSettings());
}

export function createInitialState() {
  return {
    settings: createDefaultSettings(),
    image: null,
    imageToken: 0,
    grid: null,
    edits: new Map(),
    viewMode: "canvas",
    compareEnabled: false,
    comparePosition: 50,
    editMode: false,
    editTool: "paint",
    brushChar: "#",
    dirty: {
      grid: true,
      canvas: true,
      text: true,
      reprocess: true,
    },
    isProcessing: false,
    lastCanvasMeta: null,
    activeTab: "convert",
    customPresetSelection: "",
  };
}

export const state = createInitialState();
