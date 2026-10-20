import { LIMITS } from "./state.js";
import { isEditableElement } from "./dom.js";

const KNOWN_IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|bmp|avif|svg|ico|tiff?)$/i;
let initialized = false;

export function validateImageFile(file) {
  if (!file) return "No file was provided.";
  if (typeof file.size === "number" && file.size === 0) return "That file is empty.";
  if (file.size > LIMITS.MAX_FILE_BYTES) {
    const maxMb = Math.round(LIMITS.MAX_FILE_BYTES / (1024 * 1024));
    return `That image is too large. The limit is ${maxMb} MB.`;
  }

  const type = String(file.type || "").toLowerCase();
  const looksLikeImage = type.startsWith("image/") || KNOWN_IMAGE_EXTENSIONS.test(file.name || "");
  if (!looksLikeImage) {
    return "Unsupported file type. Choose a PNG, JPG, WEBP, GIF, BMP, AVIF, or SVG image.";
  }
  return null;
}

export async function decodeImageFile(file) {
  const validationError = validateImageFile(file);
  if (validationError) throw new Error(validationError);

  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = url;

  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("The image format could not be decoded by this browser."));
      if (image.complete && image.naturalWidth > 0) resolve();
    });

    if (typeof image.decode === "function") {
      try {
        await image.decode();
      } catch {
        if (!image.naturalWidth || !image.naturalHeight) {
          throw new Error("The image could not be decoded by this browser.");
        }
      }
    }

    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) throw new Error("The image has no readable dimensions.");

    if (width > LIMITS.MAX_SOURCE_DIMENSION || height > LIMITS.MAX_SOURCE_DIMENSION) {
      throw new Error(`Image dimensions exceed ${LIMITS.MAX_SOURCE_DIMENSION}px. Resize the image and try again.`);
    }
    if (width * height > LIMITS.MAX_SOURCE_PIXELS) {
      throw new Error("That image has too many pixels. Use an image smaller than 100 megapixels.");
    }

    return {
      element: image,
      url,
      name: file.name || "clipboard-image.png",
      size: file.size,
      type: file.type || "image/*",
      width,
      height,
      lastModified: file.lastModified || Date.now(),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function hasFiles(dataTransfer) {
  return Boolean(dataTransfer?.types && Array.from(dataTransfer.types).includes("Files"));
}

export function initImageLoader({
  fileInput,
  openButtons,
  dropOverlay,
  onFile,
  onError,
}) {
  if (initialized) return;
  initialized = true;

  const handleFile = (file) => {
    if (!file) return;
    Promise.resolve(onFile(file)).catch((error) => {
      onError(error?.message || "The image could not be loaded.");
    });
  };

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (file) handleFile(file);
  });

  for (const button of openButtons) {
    button?.addEventListener("click", () => {
      fileInput.value = "";
      fileInput.click();
    });
  }

  let dragDepth = 0;
  const setDragVisible = (visible) => {
    if (!dropOverlay) return;
    dropOverlay.hidden = !visible;
    dropOverlay.setAttribute("aria-hidden", String(!visible));
    document.body.classList.toggle("is-dragging", visible);
  };

  window.addEventListener("dragenter", (event) => {
    if (!hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    dragDepth += 1;
    setDragVisible(true);
  });

  window.addEventListener("dragover", (event) => {
    if (!hasFiles(event.dataTransfer)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    setDragVisible(true);
  });

  window.addEventListener("dragleave", (event) => {
    if (!hasFiles(event.dataTransfer)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) setDragVisible(false);
  });

  window.addEventListener("drop", (event) => {
    event.preventDefault();
    dragDepth = 0;
    setDragVisible(false);
    const files = Array.from(event.dataTransfer?.files || []);
    if (!files.length) return;
    const imageFile = files.find((file) => !validateImageFile(file));
    if (imageFile) {
      handleFile(imageFile);
    } else {
      onError(validateImageFile(files[0]) || "Drop an image file to continue.");
    }
  });

  window.addEventListener("dragend", () => {
    dragDepth = 0;
    setDragVisible(false);
  });

  document.addEventListener("paste", (event) => {
    if (isEditableElement(event.target) || document.querySelector("dialog[open]")) return;
    const items = event.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          event.preventDefault();
          handleFile(file);
          break;
        }
      }
    }
  });
}
