import { getFontStack } from "./renderer.js";
import { gridToRows } from "./ascii-engine.js";
import { contrastTextColor, hexToRgb } from "./image-processing.js";

function assertGrid(grid) {
  if (!grid || !grid.cols || !grid.rows || !Array.isArray(grid.chars)) {
    throw new Error("No valid ASCII grid is available for export.");
  }
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cleanMeta(value, fallback = "image") {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  return cleaned || fallback;
}

function colorForIndex(grid, index) {
  if (grid.flatColor) return grid.flatColor;
  if (grid.colors) {
    const packed = grid.colors[index];
    const hex = packed.toString(16).padStart(6, "0");
    return `#${hex}`;
  }
  return "#ffffff";
}

function buildRowsAsRuns(grid) {
  const rows = [];
  for (let row = 0; row < grid.rows; row += 1) {
    const runs = [];
    const start = row * grid.cols;
    let current = null;
    for (let col = 0; col < grid.cols; col += 1) {
      const index = start + col;
      const color = colorForIndex(grid, index);
      const character = grid.chars[index];
      if (!current || current.color !== color) {
        current = { color, text: "", start: col };
        runs.push(current);
      }
      current.text += character;
    }
    rows.push(runs);
  }
  return rows;
}

function generatedStamp(meta) {
  const parsed = meta.generatedAt ? new Date(meta.generatedAt) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

export function makeExportFilename(sourceName, extension) {
  const cleaned = String(sourceName || "ascii-forge")
    .replace(/\.[^./\\]+$/, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/[-_]{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 64);
  return `${cleaned || "ascii-forge"}-ascii.${extension}`;
}

export function buildPlainText(grid, { includeHeader = false, meta = {}, settings = null } = {}) {
  assertGrid(grid);
  const body = gridToRows(grid).join("\n");
  if (!includeHeader) return body;

  const source = cleanMeta(meta.sourceName, "image");
  const mode = grid.colorMode || settings?.colorMode || "neon";
  const edited = Number.isFinite(meta.editedCount) && meta.editedCount > 0
    ? `# Manual edits: ${meta.editedCount}\n`
    : "";
  const header = [
    "# ASCII.FORGE — ASCII ART EXPORT",
    `# Source: ${source}`,
    `# Grid: ${grid.cols} columns × ${grid.rows} rows · ${grid.cols * grid.rows} cells`,
    `# Charset: ${cleanMeta(grid.charset, "")}`,
    `# Color mode: ${mode}`,
    edited.trimEnd(),
    `# Generated: ${generatedStamp(meta)}`,
    "# ---",
  ].filter(Boolean).join("\n");

  return `${header}\n${body}`;
}

export function buildSvg(grid, settings, renderMeta = {}) {
  assertGrid(grid);
  const source = cleanMeta(renderMeta.sourceName, "image");
  const fontSize = Number(renderMeta.fontSize) || Math.max(5, grid.blockSize);
  const charWidth = Number(renderMeta.charWidth) || fontSize * 0.6;
  const lineHeight = Number(renderMeta.lineHeight) || fontSize;
  const baseline = Number(renderMeta.baseline) || fontSize * 0.8;
  const width = Number(renderMeta.width) || Math.ceil(grid.cols * charWidth);
  const height = Number(renderMeta.height) || Math.ceil(grid.rows * lineHeight);
  const textWidth = grid.cols * charWidth;
  const fontStack = escapeXml(getFontStack(settings.font));
  const weight = settings.bold ? 700 : 400;
  const rows = buildRowsAsRuns(grid);

  const textElements = rows.map((runs, row) => {
    const visible = runs.map((run) => run.text).join("");
    if (!visible.trim()) return "";
    const y = (row * lineHeight + baseline).toFixed(2);
    if (runs.length === 1) {
      return `    <text x="0" y="${y}" textLength="${textWidth.toFixed(2)}" lengthAdjust="spacing" xml:space="preserve" fill="${escapeXml(runs[0].color)}">${escapeXml(runs[0].text)}</text>`;
    }
    const spans = runs.map((run) => (
      `<tspan fill="${escapeXml(run.color)}">${escapeXml(run.text)}</tspan>`
    )).join("");
    return `    <text x="0" y="${y}" textLength="${textWidth.toFixed(2)}" lengthAdjust="spacing" xml:space="preserve">${spans}</text>`;
  }).filter(Boolean).join("\n");

  const neonDefs = grid.glow && grid.flatColor ? `
    <filter id="neonGlow" x="-8%" y="-8%" width="116%" height="116%">
      <feGaussianBlur stdDeviation="${Math.max(0.7, fontSize * 0.12).toFixed(2)}" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>` : "";
  const textGroupAttrs = neonDefs ? ` filter="url(#neonGlow)"` : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">ASCII.FORGE — ${escapeXml(source)}</title>
  <desc id="desc">Generated ASCII artwork, ${grid.cols} columns by ${grid.rows} rows.</desc>
  <defs>${neonDefs}
    <style>text{font-family:${fontStack};font-size:${fontSize}px;font-weight:${weight};white-space:pre;font-variant-ligatures:none;font-feature-settings:"liga" 0,"calt" 0;}</style>
  </defs>
  <rect width="100%" height="100%" fill="${escapeXml(settings.bgColor)}"/>
  <g${textGroupAttrs}>
${textElements}
  </g>
</svg>
`;
}

export function buildHtml(grid, settings, renderMeta = {}) {
  assertGrid(grid);
  const source = cleanMeta(renderMeta.sourceName, "image");
  const fontSize = Number(renderMeta.fontSize) || Math.max(5, grid.blockSize);
  const lineHeight = Number(renderMeta.lineHeight) || fontSize;
  const ratio = (lineHeight / fontSize).toFixed(3);
  const fontStack = getFontStack(settings.font);
  const baseColor = grid.flatColor || contrastTextColor(settings.bgColor);
  const weight = settings.bold ? 700 : 400;
  const rows = buildRowsAsRuns(grid);
  const body = rows.map((runs) => runs.map((run) => (
    `<span style="color:${escapeHtml(run.color)}">${escapeHtml(run.text)}</span>`
  )).join("")).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ASCII.FORGE — ${escapeHtml(source)}</title>
<meta name="generator" content="ASCII.FORGE">
<!-- Generated ${escapeHtml(generatedStamp(renderMeta))} · ${grid.cols}×${grid.rows} grid -->
<style>
  :root { color-scheme: dark; }
  html, body { margin: 0; min-height: 100%; background: ${settings.bgColor}; }
  body { padding: 24px; overflow: auto; }
  pre.ascii-art {
    display: inline-block;
    margin: 0;
    color: ${escapeHtml(baseColor)};
    font-family: ${fontStack};
    font-size: ${fontSize}px;
    font-weight: ${weight};
    line-height: ${ratio};
    white-space: pre;
    font-variant-ligatures: none;
    font-feature-settings: "liga" 0, "calt" 0;
  }
</style>
</head>
<body>
<pre class="ascii-art" aria-label="ASCII art generated from ${escapeHtml(source)}">${body}</pre>
</body>
</html>
`;
}

export function buildAnsi(grid, settings) {
  assertGrid(grid);
  const rows = buildRowsAsRuns(grid);
  const background = hexToRgb(settings.bgColor);
  const bgSequence = `\u001b[48;2;${background.r};${background.g};${background.b}m`;

  return rows.map((runs) => {
    let line = bgSequence;
    for (const run of runs) {
      const color = hexToRgb(run.color);
      line += `\u001b[38;2;${color.r};${color.g};${color.b}m${run.text}`;
    }
    return `${line}\u001b[0m`;
  }).join("\n");
}

export function downloadBlob(blob, filename) {
  if (!(blob instanceof Blob)) throw new Error("Export data could not be created.");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function downloadText(content, filename, mime = "text/plain;charset=utf-8") {
  downloadBlob(new Blob([content], { type: mime }), filename);
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The browser returned an empty image export."));
      }, type, quality);
    } catch {
      reject(new Error("This canvas is too large or cannot be exported by this browser."));
    }
  });
}

export async function downloadCanvas(canvas, format, sourceName = "ascii-forge") {
  if (!canvas || !canvas.width || !canvas.height) {
    throw new Error("There is no rendered artwork to download.");
  }
  const normalized = format === "jpg" || format === "jpeg" ? "jpg" : "png";
  const type = normalized === "jpg" ? "image/jpeg" : "image/png";
  const blob = await canvasToBlob(canvas, type, normalized === "jpg" ? 0.95 : undefined);
  downloadBlob(blob, makeExportFilename(sourceName, normalized));
}

export async function copyTextToClipboard(text) {
  if (typeof text !== "string") throw new Error("No text is available to copy.");
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the legacy path when permission or focus blocks the API.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    textarea.remove();
  }
  if (!copied) throw new Error("Clipboard access was denied. Select the text in Text view and copy it manually.");
}
