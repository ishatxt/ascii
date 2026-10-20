import {
  APP_VERSION,
  COLOR_MODE_IDS,
  FONT_IDS,
  LIMITS,
  STORAGE_KEY,
  isUnsafeGlyph,
  sanitizeSettings,
  settingsSnapshot,
} from "./state.js";

export const BUILTIN_PRESETS = Object.freeze([
  { id: "classic", label: "Classic", charset: "@#S%?*+;:,. " },
  { id: "dense", label: "Dense", charset: "█▓▒░·  " },
  { id: "binary", label: "Binary", charset: "10 " },
  { id: "minimal", label: "Minimal", charset: "●○·  " },
  { id: "symbols", label: "Symbols", charset: "◈◇◆▲▽▼◉○·  " },
  { id: "slashes", label: "Slashes", charset: "#/\\|=-:. " },
  { id: "dots", label: "Dots", charset: "⣿⣶⣤⡀  " },
  { id: "numbers", label: "Numbers", charset: "0123456789 " },
]);

const BUILTIN_NAMES = new Set(BUILTIN_PRESETS.map((preset) => preset.label.toLowerCase()));
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const NUMERIC_SETTINGS = {
  blockSize: [LIMITS.MIN_BLOCK_SIZE, LIMITS.MAX_BLOCK_SIZE],
  brightness: [-100, 100],
  contrast: [-100, 100],
  textFontSize: [8, 24],
  textLineHeight: [1, 2.2],
};

const COLOR_SETTINGS = ["fgColor", "bgColor", "gradientStart", "gradientMid", "gradientEnd"];
const BOOLEAN_SETTINGS = ["invert", "edgeDetection", "bold"];

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeName(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function validatePresetName(name, existingPresets = [], { excludeId = null } = {}) {
  const value = normalizeName(name);
  if (!value) return { ok: false, error: "Enter a preset name." };
  if (Array.from(value).length > 40) return { ok: false, error: "Preset names are limited to 40 characters." };
  if (/[\u0000-\u001f\u007f]/.test(value)) return { ok: false, error: "Preset names cannot contain control characters." };
  if (BUILTIN_NAMES.has(value.toLowerCase())) {
    return { ok: false, error: "That name is reserved by a built-in preset." };
  }
  const duplicate = existingPresets.find(
    (preset) => preset.id !== excludeId && preset.name.toLowerCase() === value.toLowerCase(),
  );
  if (duplicate) return { ok: false, error: "A custom preset with that name already exists." };
  return { ok: true, value };
}

export function validatePresetSettings(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Preset settings must be an object.");
  }
  if (typeof value.charset !== "string") {
    throw new Error("Preset settings must include a character set.");
  }
  const charsetLength = Array.from(value.charset).length;
  if (charsetLength < 1 || charsetLength > LIMITS.MAX_CHARSET_LENGTH) {
    throw new Error(`Character set must contain 1–${LIMITS.MAX_CHARSET_LENGTH} glyphs.`);
  }
  if (Array.from(value.charset).some((character) => isUnsafeGlyph(character))) {
    throw new Error("Character set cannot contain control or line-break characters.");
  }

  for (const [key, [min, max]] of Object.entries(NUMERIC_SETTINGS)) {
    if (!(key in value)) continue;
    if (typeof value[key] !== "number" || !Number.isFinite(value[key])) {
      throw new Error(`settings.${key} must be a number.`);
    }
    if (value[key] < min || value[key] > max) {
      throw new Error(`settings.${key} must be between ${min} and ${max}.`);
    }
  }

  for (const key of COLOR_SETTINGS) {
    if (!(key in value)) continue;
    if (typeof value[key] !== "string" || !HEX_COLOR.test(value[key].trim())) {
      throw new Error(`settings.${key} must be a valid hex color.`);
    }
  }

  for (const key of BOOLEAN_SETTINGS) {
    if (!(key in value)) continue;
    if (typeof value[key] !== "boolean") throw new Error(`settings.${key} must be true or false.`);
  }

  if ("colorMode" in value && !COLOR_MODE_IDS.includes(value.colorMode)) {
    throw new Error("settings.colorMode is not a supported color mode.");
  }
  if ("font" in value && !FONT_IDS.includes(value.font)) {
    throw new Error("settings.font is not a supported font.");
  }

  return sanitizeSettings(value);
}

function sanitizeStoredPreset(raw, { requireName = true } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Preset entry is not an object.");
  }
  const name = normalizeName(raw.name);
  if (requireName && !name) throw new Error("Preset is missing a name.");
  if (name.length > 40) throw new Error("Preset name is too long.");
  if (/[\u0000-\u001f\u007f]/.test(name)) throw new Error("Preset name contains control characters.");
  const settings = validatePresetSettings(raw.settings);
  return {
    id: typeof raw.id === "string" && raw.id.length >= 4 && raw.id.length <= 80 ? raw.id : createId(),
    name: name || "Untitled preset",
    settings: settingsSnapshot(settings),
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
  };
}

function makeUniqueName(name, usedNames) {
  const base = normalizeName(name).slice(0, 40) || "Imported preset";
  let candidate = base;
  let suffixIndex = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    const suffix = ` (${suffixIndex})`;
    candidate = `${base.slice(0, Math.max(1, 40 - suffix.length)).trimEnd()}${suffix}`;
    suffixIndex += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

export function loadStoredPresets() {
  if (typeof localStorage === "undefined") {
    return { presets: [], warning: "Browser storage is unavailable. Custom presets cannot persist." };
  }

  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return { presets: [], warning: "Browser storage is blocked. Custom presets cannot persist." };
  }
  if (!raw) return { presets: [], warning: null };

  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : parsed?.presets;
    if (!Array.isArray(list)) throw new Error("Stored presets have an invalid shape.");

    const presets = [];
    const usedNames = new Set(BUILTIN_NAMES);
    let skipped = 0;

    for (const entry of list.slice(0, LIMITS.MAX_CUSTOM_PRESETS)) {
      try {
        const preset = sanitizeStoredPreset(entry);
        preset.name = makeUniqueName(preset.name, usedNames);
        presets.push(preset);
      } catch {
        skipped += 1;
      }
    }

    if (!presets.length) {
      localStorage.removeItem(STORAGE_KEY);
      return {
        presets: [],
        warning: "Stored custom presets were invalid. Built-in presets remain available.",
      };
    }

    return {
      presets,
      warning: skipped ? `${skipped} invalid custom preset(s) were skipped.` : null,
    };
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage can be unavailable; the in-memory presets still work.
    }
    return {
      presets: [],
      warning: "Stored custom presets could not be read and were reset.",
    };
  }
}

export function saveStoredPresets(presets) {
  if (typeof localStorage === "undefined") {
    return { ok: false, error: "Browser storage is unavailable in this environment." };
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      app: "ASCII.FORGE",
      version: 1,
      type: "asciiforge-presets",
      presets,
    }));
    return { ok: true };
  } catch (error) {
    const quota = error?.name === "QuotaExceededError";
    return {
      ok: false,
      error: quota
        ? "Browser storage is full. Delete a preset and try again."
        : "Custom presets could not be saved to browser storage.",
    };
  }
}

export function addCustomPreset(presets, name, settings) {
  if (presets.length >= LIMITS.MAX_CUSTOM_PRESETS) {
    throw new Error(`Custom preset limit reached (${LIMITS.MAX_CUSTOM_PRESETS}).`);
  }
  const validation = validatePresetName(name, presets);
  if (!validation.ok) throw new Error(validation.error);
  const preset = {
    id: createId(),
    name: validation.value,
    settings: settingsSnapshot(settings),
    createdAt: Date.now(),
  };
  return [preset, ...presets];
}

export function renameCustomPreset(presets, id, name) {
  const target = presets.find((preset) => preset.id === id);
  if (!target) throw new Error("The selected preset no longer exists.");
  const validation = validatePresetName(name, presets, { excludeId: id });
  if (!validation.ok) throw new Error(validation.error);
  return presets.map((preset) => (preset.id === id ? { ...preset, name: validation.value } : preset));
}

export function deleteCustomPreset(presets, id) {
  const next = presets.filter((preset) => preset.id !== id);
  if (next.length === presets.length) throw new Error("The selected preset no longer exists.");
  return next;
}

export function getCustomPreset(presets, id) {
  return presets.find((preset) => preset.id === id) ?? null;
}

export function serializePresets(presets) {
  return JSON.stringify({
    app: "ASCII.FORGE",
    type: "asciiforge-presets",
    version: 1,
    exportedWith: APP_VERSION,
    exportedAt: new Date().toISOString(),
    presets: presets.map((preset) => ({
      name: preset.name,
      settings: settingsSnapshot(preset.settings),
      createdAt: preset.createdAt,
    })),
  }, null, 2);
}

export function parsePresetFile(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("The selected file is empty.");
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON.");
  }

  let entries;
  if (Array.isArray(parsed)) {
    entries = parsed;
  } else if (parsed && Array.isArray(parsed.presets)) {
    entries = parsed.presets;
  } else if (parsed && parsed.settings) {
    entries = [parsed];
  } else {
    throw new Error("Unrecognized preset file. Expected an ASCII.FORGE preset export.");
  }

  if (!entries.length) throw new Error("The file does not contain any presets.");
  if (entries.length > LIMITS.MAX_CUSTOM_PRESETS) {
    throw new Error(`The file contains too many presets (maximum ${LIMITS.MAX_CUSTOM_PRESETS}).`);
  }

  const presets = [];
  let skipped = 0;
  for (const entry of entries) {
    try {
      const preset = sanitizeStoredPreset(entry);
      if (BUILTIN_NAMES.has(preset.name.toLowerCase())) {
        skipped += 1;
        continue;
      }
      presets.push({ ...preset, id: createId(), createdAt: Date.now() });
    } catch {
      skipped += 1;
    }
  }

  if (!presets.length) {
    throw new Error("No valid presets were found in that file.");
  }

  return { presets, skipped, total: entries.length };
}

export function mergeImportedPresets(existing, imported) {
  const usedNames = new Set(BUILTIN_NAMES);
  existing.forEach((preset) => usedNames.add(preset.name.toLowerCase()));

  const availableSlots = Math.max(0, LIMITS.MAX_CUSTOM_PRESETS - existing.length);
  const accepted = [];
  let skippedForLimit = 0;

  for (const preset of imported) {
    if (accepted.length >= availableSlots) {
      skippedForLimit += 1;
      continue;
    }
    accepted.push({
      ...preset,
      id: createId(),
      name: makeUniqueName(preset.name, usedNames),
      createdAt: Date.now(),
    });
  }

  return {
    presets: [...accepted, ...existing],
    accepted,
    skippedForLimit,
  };
}
