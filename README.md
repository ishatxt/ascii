# ASCII.FORGE

A zero-build, client-side image-to-ASCII studio. Drop in an image, tune the conversion, compare it with the source, edit individual characters, and export the result as text, an image, a vector, a standalone HTML page, or a truecolor ANSI file.

Everything runs in the browser. Images are never uploaded, and the project has no backend, external API, framework, package manager, or build step.

**Live site (once GitHub Pages is enabled):** <https://ishatxt.github.io/ascii/>

---

## Highlights

- **Load images your way** — file picker, drag and drop anywhere on the page, or paste from the clipboard. Accepts browser-decodable image formats such as PNG, JPEG, WebP, GIF, BMP, AVIF, and SVG.
- **Eight built-in character presets** — Classic, Dense, Binary, Minimal, Symbols, Slashes, Dots, and Numbers.
- **Custom character set** — set your own dark-to-light glyph ramp, up to 64 active glyphs.
- **Nine color modes** — Neon, Original, Mono, Grayscale, Custom, Gradient, Terminal, Amber CRT, and Rainbow. Foreground, background, and three gradient stops are configurable.
- **Image preparation** — brightness, contrast, inversion, and Sobel edge detection.
- **Typography controls** — JetBrains Mono (self-hosted), Courier New, Lucida Console, or the system monospace stack, with optional bold.
- **Comparison slider** — overlay the original source and the ASCII canvas, then drag, click, or use the keyboard to compare.
- **Character editing** — paint or erase individual cells with undo/redo. Edits travel with same-size regenerations and are included in every export.
- **Genuine text view** — read and select the exact plain-text grid, with adjustable size and line spacing.
- **Custom presets** — save the complete conversion setup locally, rename, delete, export, and import JSON preset files.
- **Multiple exports** — PNG, JPG, TXT, vector SVG, standalone HTML, and 24-bit ANSI.
- **Responsive and accessible** — a mobile control sheet, keyboard navigation, skip link, labelled controls, dialogs, live status messages, and reduced-motion support.

## Quick start

No installation or build is required. Because the app uses native ES modules, serve the directory over HTTP rather than opening `index.html` directly from the filesystem.

```bash
git clone https://github.com/ishatxt/ascii.git
cd ascii

# Any static file server works. For example:
python3 -m http.server 8000
```

Open <http://127.0.0.1:8000/>.

Node's `npx serve` or any editor live-server extension also works. There is no `npm install` step.

## Deploying to GitHub Pages

The site uses only relative paths, so it works at a project URL such as `https://ishatxt.github.io/ascii/` and requires no path rewriting.

1. Push the repository to GitHub with `index.html` at the repository root.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the `main` branch and the `/ (root)` folder, then save.

GitHub Pages serves the static files directly. No Actions workflow or build configuration is needed.

Check these once after deployment:

- The app loads over HTTPS.
- Fonts and the favicon load from `assets/`.
- Clipboard access works (it may require a secure context and browser permission).
- Downloads work in the target browser.

## Using the studio

1. **Upload** with the button, drag an image onto the stage, or press <kbd>Ctrl</kbd>+<kbd>V</kbd> to paste.
2. Choose a **character preset** or type a custom character set. The first glyph represents the darkest pixels and the last represents the brightest.
3. Adjust **resolution** with the pixel-block slider (2 px = more detail, 40 px = chunkier).
4. Refine the image with **brightness**, **contrast**, **invert**, and **Sobel edge detection**.
5. Pick a **color mode** and adjust colors and typography in the **Style** panel.
6. Use **Compare** to check the source, or **Edit** to paint and erase characters.
7. Copy the text or download an export from the **Export** panel.

The footer reports the source name and dimensions; the statistics strip reports the actual columns, rows, character count, and conversion time. If a requested resolution would exceed the grid limits, the app caps it and reports the effective grid instead of freezing the browser.

### Built-in presets

| Preset | Character set |
| --- | --- |
| Classic | `@#S%?*+;:,. ` |
| Dense | `█▓▒░·  ` |
| Binary | `10 ` |
| Minimal | `●○·  ` |
| Symbols | `◈◇◆▲▽▼◉○·  ` |
| Slashes | `#/\|=-:. ` |
| Dots | `⣿⣶⣤⡀  ` |
| Numbers | `0123456789 ` |

### Color modes

| Mode | Behavior |
| --- | --- |
| Neon | Foreground color with a soft phosphor glow. |
| Original | Samples the source image color for each character. |
| Mono | Fixed off-white characters over the selected background. |
| Grayscale | Character color follows sampled luminance. |
| Custom | One foreground color for every visible character. |
| Gradient | Luminance mapped across three configurable color stops. |
| Terminal | Fixed phosphor-green shade palette. |
| Amber CRT | Warm amber shade palette. |
| Rainbow | Hue derived from character position and luminance. |

## Keyboard shortcuts

Use <kbd>Cmd</kbd> instead of <kbd>Ctrl</kbd> on macOS. Shortcuts are ignored while typing in a text field or select.

| Shortcut | Action |
| --- | --- |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd> | Copy the exact ASCII grid as text |
| <kbd>Ctrl</kbd>+<kbd>S</kbd> | Download PNG |
| <kbd>Ctrl</kbd>+<kbd>Z</kbd> | Undo character edit |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> | Redo character edit |
| <kbd>Alt</kbd>+<kbd>C</kbd> | Toggle the comparison slider |
| <kbd>Alt</kbd>+<kbd>E</kbd> | Toggle character editing |
| <kbd>Shift</kbd>+<kbd>/</kbd> or <kbd>?</kbd> | Open the shortcut reference |
| <kbd>Esc</kbd> | Close a dialog/panel, or exit comparison/editing |
| <kbd>←</kbd> / <kbd>→</kbd> | Move the comparison divider by 2% |
| <kbd>Shift</kbd>+<kbd>←</kbd> / <kbd>→</kbd> | Move the comparison divider by 10% |

When the comparison handle has focus, <kbd>Home</kbd> and <kbd>End</kbd> jump to 0% and 100%.

## Export formats

| Format | What it contains |
| --- | --- |
| **PNG** | Raster canvas at full render resolution, including the active colors, background, and neon glow. |
| **JPG** | Same canvas as PNG, encoded as JPEG at quality 0.95. |
| **TXT** | Exact plain-text grid. An optional metadata header can be enabled in the Export panel. |
| **SVG** | Vector text grouped into color runs, with background, font, weight, and neon glow. Text remains selectable. |
| **HTML** | Self-contained page with a `<pre>` of colorized spans. No scripts or external dependencies. |
| **ANSI** | Truecolor 24-bit SGR escape sequences with the selected background, suitable for terminal viewers that support them. |

The canvas, text view, clipboard copy, and every text-based export are built from the same ASCII grid. Character edits and same-size regenerations therefore stay consistent across all outputs.

PNG and JPG render at the canvas's internal resolution, which is based on the effective block size and font metrics. Very large grids can produce very large canvases; if the browser cannot allocate or encode one, the app reports the failure instead of downloading an empty file.

## Custom presets

Custom presets are stored in `localStorage` under `asciiforge.customPresets.v1`. They are local to the current browser profile and are not synced anywhere. The app never silently claims a preset persisted if storage fails; quota or privacy-mode errors are reported in the status bar and toast.

Saving captures all conversion and appearance settings:

`charset`, `blockSize`, `colorMode`, `fgColor`, `bgColor`, `gradientStart`, `gradientMid`, `gradientEnd`, `brightness`, `contrast`, `invert`, `edgeDetection`, `bold`, `font`, `textFontSize`, and `textLineHeight`.

The source image, manual cell edits, and view mode are not part of a preset.

### Preset file schema

Exporting produces a versioned JSON document:

```json
{
  "app": "ASCII.FORGE",
  "type": "asciiforge-presets",
  "version": 1,
  "exportedWith": "3.0.0",
  "exportedAt": "2026-10-20T12:00:00.000Z",
  "presets": [
    {
      "name": "Amber Terminal",
      "settings": {
        "charset": "@#S%?*+;:,. ",
        "blockSize": 10,
        "colorMode": "amber",
        "fgColor": "#ffb443",
        "bgColor": "#000000",
        "gradientStart": "#00ff88",
        "gradientMid": "#00c8ff",
        "gradientEnd": "#ff2fff",
        "brightness": 0,
        "contrast": 15,
        "invert": false,
        "edgeDetection": false,
        "bold": true,
        "font": "JetBrains Mono",
        "textFontSize": 12,
        "textLineHeight": 1.2
      },
      "createdAt": 1760961600000
    }
  ]
}
```

Import accepts the export above, a bare array of presets, or a single object with a `settings` object. On import:

- Files must be valid JSON and no larger than **512 KB**.
- At most **100** presets can be stored.
- Each preset must have a name and a valid settings object. Missing optional settings fall back to defaults; invalid values are rejected.
- Character sets must contain 1–64 glyphs and cannot contain control or line-break characters.
- Built-in preset names are reserved. Matching imported presets are skipped.
- Duplicate custom names receive a numeric suffix such as ` (2)`.
- Imports create new IDs and never overwrite built-in or existing presets.

## How it works

The render pipeline is deliberately one-way:

```
File/drop/paste
    ↓  validate size and decode
Image object
    ↓  scale to at most 1600 px on the long edge
Preprocessed pixel buffer (brightness, contrast, Sobel)
    ↓  sample blocks and map luminance to glyphs
state.grid  ← manual edits live alongside it
    ↓
canvas · text view · clipboard · TXT · SVG · HTML · ANSI
```

- The **processed image cache** is reused while image and pixel-prep settings are unchanged.
- Image loads use a token so a slow earlier decode cannot replace a newer upload.
- Rendering is scheduled and deduplicated with timeouts and animation frames to avoid stale or overlapping output.
- The effective grid is capped by cell, column, and row limits before rendering.
- Edits are stored by cell index, reapplied after same-size regeneration, and cleared with a warning if the grid size changes.
- The canvas and text exports read from the same grid, so copy, TXT, and on-screen text cannot drift apart.

### Project structure

```
.
├── index.html                  # Semantic layout, controls, dialogs, inline SVG icon sprite
├── css/
│   ├── reset.css               # Base reset
│   ├── variables.css           # Font faces, palette, dimensions, easing
│   ├── layout.css              # App shell, workspace, sidebar
│   ├── components.css          # Buttons, panels, controls, dialogs, toasts
│   ├── editor.css              # Comparison, editing, text view
│   └── responsive.css          # Tablet/mobile shell and mobile control sheet
├── js/
│   ├── app.js                  # Controller, wiring, render scheduler, editing, exports
│   ├── state.js                # Constants, limits, defaults, sanitizers
│   ├── dom.js                  # Element lookup, readiness checks, editable-element guard
│   ├── image-loader.js         # Upload validation, file/drop/paste plumbing
│   ├── image-processing.js     # Scaling, pixel prep, luminance, Sobel
│   ├── ascii-engine.js         # Grid generation, dimensions, edits, text conversion
│   ├── renderer.js             # Canvas/text rendering and single-cell painting
│   ├── exports.js              # TXT/SVG/HTML/ANSI builders, canvas downloads, clipboard
│   ├── presets.js              # Built-in and custom preset validation and persistence
│   ├── history.js              # Bounded undo/redo stack for character edits
│   └── ui.js                   # Status, toasts, dialogs, tabs, statistics, mobile panel
├── assets/
│   ├── favicon.svg
│   └── fonts/                  # Self-hosted WOFF2 files + OFL license texts
└── backup/
    └── index.original.html     # Untouched original single-file implementation
```

Every module is a native ES module; there is no bundler, transpiler, dependency graph to install, or generated output. The original single-file version is preserved for reference and recovery.

## Limits and safety

| Limit | Value |
| --- | --- |
| Upload size | 40 MB |
| Maximum source dimension | 16,384 px per side |
| Maximum source pixels | 100 megapixels |
| Working image long edge | 1,600 px |
| Pixel block size | 2–40 px |
| Maximum grid cells | 60,000 |
| Maximum grid columns | 480 |
| Maximum grid rows | 480 |
| Active character-set glyphs | 64 |
| Custom presets | 100 |
| Preset import file size | 512 KB |
| Undo history | 80 edits |

These limits are enforced in code, not just in the UI. Oversized files, unreadable images, malformed presets, storage-quota failures, and export errors produce an explicit status message or toast. Uploaded images are decoded in the page, scaled on an offscreen canvas, and never sent over the network.

## Privacy

- No uploads, analytics, trackers, cookies, remote fonts, or third-party requests.
- The only persisted data is custom presets in `localStorage`.
- Export files are generated locally with `Blob` URLs.
- Images remain in memory for the current session and are released when replaced or when **New image** is used.

## Accessibility and responsive design

- Skip link to the workspace, visible focus styles, and keyboard-operable controls.
- The comparison divider is a labelled ARIA separator with arrow/Home/End support.
- Tabs, dialogs, status, and toasts expose appropriate semantics and live regions.
- Decorative SVGs are hidden from assistive technology; icon-only controls have accessible names.
- Editing and comparison have touch-action handling so gestures do not scroll the page.
- The mobile control sheet closes with Escape or the backdrop.
- Reduced-motion preferences disable transitions and animations.
- Layouts were checked from 320 px through 1440 px wide without horizontal overflow.

## Browser support

Recommended: a current Chromium-based browser (Chrome, Edge, Brave, Opera) or current Firefox/Safari.

The app relies on modern platform features including ES modules, `<dialog>`, Canvas 2D, `Blob` URLs, and the async Clipboard API with an `execCommand` fallback. Older browsers may miss individual features; the UI falls back where practical but is not intended for legacy browsers.

### Verification status

The implementation was exercised in **HeadlessChrome 151 on Linux** against a local static server using DevTools Protocol automation, at desktop and mobile viewport sizes.

**Verified:**

- Startup, local `@font-face` loading, all eight built-in presets, all nine color modes, color controls, typography, stats, and responsive canvas fitting.
- File picker, drag and drop, clipboard paste, SVG/transparent/portrait/large images, and rejection of empty, corrupt, oversized, and over-limit files.
- Rapid image replacement without stale results.
- Text view, clipboard equality with the shared grid, TXT (with and without header), PNG, JPG, SVG, HTML, and ANSI exports, including file naming and parse checks.
- Comparison slider via mouse, keyboard, touch emulation, and reset/escape behavior.
- Paint/erase editing, drag painting, undo/redo, edit counts, regeneration, resize warnings, and replacement/reset confirmations.
- Custom preset save/load/rename/delete, persistence, validation, import/export, duplicate handling, malformed files, and storage-quota failure handling.
- Exact limit enforcement, including 40 MB, 100 MP, 1,600 px working scale, 60,000 cells, 64 glyphs, 512 KB preset imports, and 100 presets.
- Keyboard shortcuts and input-field guards, charset sanitization, export escaping, and XML/HTML parsing.
- Responsive layouts at 1440, 1280, 1024, 900, 861, 860, 768, 640, 390, and 320 px; mobile sheet and touch gestures via CDP touch emulation.
- Static accessibility checks: no duplicate IDs, broken label/ARIA references, unnamed buttons, or missing image alternatives.
- Runtime console and network audits: no uncaught exceptions or failed local resources.

**Not independently verified:**

- Firefox, Safari, mobile Safari, and other browser engines.
- Physical touch hardware (gestures were tested with CDP touch emulation).
- Screen-reader reading order and announcements.
- Clipboard behavior under restrictive enterprise policies or non-secure origins.
- Availability of the system-only fonts Courier New and Lucida Console on every operating system.
- Extreme canvas exports near the maximum grid size on low-memory devices.

## Credits

- **JetBrains Mono** — self-hosted webfont, SIL Open Font License 1.1 (`assets/fonts/OFL-JetBrainsMono.txt`).
- **Orbitron** — self-hosted display font, SIL Open Font License 1.1 (`assets/fonts/OFL-Orbitron.txt`).

No project-wide license is currently declared in this repository. The font licenses apply only to the font files and their derivatives.
