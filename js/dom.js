export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const refs = {
  app: "app",
  workspace: "workspace",
  uploadBtn: "uploadBtn",
  shortcutsBtn: "shortcutsBtn",
  controlsBtn: "controlsBtn",
  fileInput: "fileInput",
  presetFileInput: "presetFileInput",

  canvasViewBtn: "canvasViewBtn",
  textViewBtn: "textViewBtn",
  compareBtn: "compareBtn",
  editBtn: "editBtn",
  undoBtn: "undoBtn",
  redoBtn: "redoBtn",
  gridBadge: "gridBadge",
  editToolbar: "editToolbar",
  paintToolBtn: "paintToolBtn",
  eraseToolBtn: "eraseToolBtn",
  brushChar: "brushChar",
  editCount: "editCount",
  clearEditsBtn: "clearEditsBtn",

  stage: "stage",
  dropZone: "dropZone",
  artwork: "artwork",
  canvasLayer: "canvasLayer",
  outputCanvas: "outputCanvas",
  comparisonImage: "comparisonImage",
  compareOverlay: "compareOverlay",
  compareDivider: "compareDivider",
  textPreviewWrap: "textPreviewWrap",
  textPreview: "textPreview",
  processingLine: "processingLine",
  dropOverlay: "dropOverlay",
  textToolbar: "textToolbar",
  textFontSize: "textFontSize",
  textFontSizeVal: "textFontSizeVal",
  textLineHeight: "textLineHeight",
  textLineHeightVal: "textLineHeightVal",
  copyTextBtn: "copyTextBtn",
  fileName: "fileName",
  fileDims: "fileDims",
  outputInfo: "outputInfo",

  sidebar: "sidebar",
  sidebarHandle: "sidebarHandle",
  backdrop: "backdrop",
  statusbar: "statusbar",
  statusDot: "statusDot",
  statusText: "statusText",
  statusRight: "statusRight",
  toastRegion: "toastRegion",

  statCols: "statCols",
  statRows: "statRows",
  statChars: "statChars",
  statMs: "statMs",

  tabConvert: "tabConvert",
  tabStyle: "tabStyle",
  tabExport: "tabExport",
  panelConvert: "panelConvert",
  panelStyle: "panelStyle",
  panelExport: "panelExport",

  presetGrid: "presetGrid",
  customPresetSelect: "customPresetSelect",
  loadPresetBtn: "loadPresetBtn",
  savePresetBtn: "savePresetBtn",
  renamePresetBtn: "renamePresetBtn",
  deletePresetBtn: "deletePresetBtn",
  exportPresetsBtn: "exportPresetsBtn",
  importPresetsBtn: "importPresetsBtn",

  charSet: "charSet",
  charSetMeta: "charSetMeta",
  charSetNote: "charSetNote",
  blockSize: "blockSize",
  blockSizeVal: "blockSizeVal",
  resolutionMeta: "resolutionMeta",
  gridLimitNote: "gridLimitNote",
  brightness: "brightness",
  brightnessVal: "brightnessVal",
  contrast: "contrast",
  contrastVal: "contrastVal",
  invertToggle: "invertToggle",
  edgeToggle: "edgeToggle",

  colorModeGrid: "colorModeGrid",
  colorModeName: "colorModeName",
  colorPickerRow: "colorPickerRow",
  fgPickerField: "fgPickerField",
  fgColor: "fgColor",
  bgColor: "bgColor",
  gradientFields: "gradientFields",
  gradientStart: "gradientStart",
  gradientMid: "gradientMid",
  gradientEnd: "gradientEnd",
  colorModeNote: "colorModeNote",
  fontSelect: "fontSelect",
  boldToggle: "boldToggle",

  copyBtn: "copyBtn",
  pngBtn: "pngBtn",
  jpgBtn: "jpgBtn",
  includeHeader: "includeHeader",
  txtBtn: "txtBtn",
  svgBtn: "svgBtn",
  htmlBtn: "htmlBtn",
  ansiBtn: "ansiBtn",
  newImageBtn: "newImageBtn",

  shortcutsDialog: "shortcutsDialog",
  presetDialog: "presetDialog",
  presetForm: "presetForm",
  presetDialogTitle: "presetDialogTitle",
  presetDialogKicker: "presetDialogKicker",
  presetDialogDescription: "presetDialogDescription",
  presetName: "presetName",
  presetError: "presetError",
  presetSubmitBtn: "presetSubmitBtn",
  confirmDialog: "confirmDialog",
  confirmTitle: "confirmTitle",
  confirmMessage: "confirmMessage",
  confirmOkBtn: "confirmOkBtn",
};

export const els = Object.fromEntries(
  Object.entries(refs).map(([name, id]) => [name, document.getElementById(id)]),
);

export const sidebarScroll = $(".sidebar-scroll");

export function isEditableElement(target) {
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select, [contenteditable='true']")) return true;
  return Boolean(target.closest("dialog[open]"));
}

export function validateDom() {
  const missing = Object.entries(refs)
    .filter(([, id]) => !document.getElementById(id))
    .map(([, id]) => `#${id}`);
  if (missing.length) {
    throw new Error(`ASCII.FORGE could not start. Missing elements: ${missing.join(", ")}`);
  }
}
