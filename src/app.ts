import { clamp, processStencil, summarizeResult } from "./engine";
import { canvasToBlob, createCombinedSvg, createLayerSvg, pagePointToSource, renderExportCanvas, renderPreview, renderSourceImage } from "./renderer";
import type { CropTransform, InteractionTool, LayerCount, Orientation, PaperPreset, PreviewMode, StencilResult, StencilSettings } from "./types";

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
};

const elements = {
  fileInput: byId<HTMLInputElement>("file-input"),
  dropzone: byId<HTMLLabelElement>("dropzone"),
  fileSummary: byId<HTMLDivElement>("file-summary"),
  fileName: byId<HTMLElement>("file-name"),
  fileMeta: byId<HTMLElement>("file-meta"),
  fileError: byId<HTMLElement>("file-error"),
  thumbCanvas: byId<HTMLCanvasElement>("thumb-canvas"),
  replaceImage: byId<HTMLButtonElement>("replace-image"),
  zoom: byId<HTMLInputElement>("zoom"),
  zoomValue: byId<HTMLOutputElement>("zoom-value"),
  rotateLeft: byId<HTMLButtonElement>("rotate-left"),
  resetCrop: byId<HTMLButtonElement>("reset-crop"),
  sampleSwatch: byId<HTMLElement>("sample-swatch"),
  sampleHelp: byId<HTMLElement>("sample-help"),
  clearSample: byId<HTMLButtonElement>("clear-sample"),
  tolerance: byId<HTMLInputElement>("background-tolerance"),
  toleranceValue: byId<HTMLOutputElement>("tolerance-value"),
  contrast: byId<HTMLInputElement>("contrast"),
  contrastValue: byId<HTMLOutputElement>("contrast-value"),
  detail: byId<HTMLInputElement>("detail"),
  detailValue: byId<HTMLOutputElement>("detail-value"),
  edgeStrength: byId<HTMLInputElement>("edge-strength"),
  edgeStrengthValue: byId<HTMLOutputElement>("edge-strength-value"),
  shadowBias: byId<HTMLInputElement>("shadow-bias"),
  shadowBiasValue: byId<HTMLOutputElement>("shadow-bias-value"),
  minDetail: byId<HTMLInputElement>("min-detail"),
  minDetailValue: byId<HTMLOutputElement>("min-detail-value"),
  bridgeWidth: byId<HTMLInputElement>("bridge-width"),
  bridgeWidthValue: byId<HTMLOutputElement>("bridge-width-value"),
  palette: byId<HTMLElement>("palette"),
  paperPreset: byId<HTMLSelectElement>("paper-preset"),
  orientation: byId<HTMLSelectElement>("orientation"),
  pageWidth: byId<HTMLInputElement>("page-width"),
  pageHeight: byId<HTMLInputElement>("page-height"),
  previewTabs: byId<HTMLElement>("preview-tabs"),
  qualityBadge: byId<HTMLElement>("quality-badge"),
  stage: byId<HTMLElement>("stage"),
  previewCanvas: byId<HTMLCanvasElement>("preview-canvas"),
  emptyState: byId<HTMLElement>("empty-state"),
  processing: byId<HTMLElement>("processing"),
  canvasHint: byId<HTMLElement>("canvas-hint"),
  resultPanel: byId<HTMLElement>("result-panel"),
  statLayers: byId<HTMLElement>("stat-layers"),
  statBridges: byId<HTMLElement>("stat-bridges"),
  statFragments: byId<HTMLElement>("stat-fragments"),
  warningList: byId<HTMLElement>("warning-list"),
  layerExports: byId<HTMLElement>("layer-exports"),
  exportCompositePng: byId<HTMLButtonElement>("export-composite-png"),
  exportCombinedSvg: byId<HTMLButtonElement>("export-combined-svg"),
  toast: byId<HTMLElement>("toast"),
};

const DEFAULT_PALETTES: Record<LayerCount, string[]> = {
  3: ["#efb0b4", "#9a3048", "#171419"],
  4: ["#efb0b4", "#ca6475", "#76253a", "#171419"],
  5: ["#efb0b4", "#cf6a7b", "#9a3048", "#532333", "#171419"],
};

const settings: StencilSettings = {
  layerCount: 5,
  profile: "portrait",
  contrast: 122,
  detail: 68,
  edgeStrength: 72,
  shadowBias: 58,
  minDetailMm: 1.5,
  bridgeWidthMm: 2.5,
  backgroundTolerance: 28,
  backgroundSample: null,
  backgroundSeed: null,
  backgroundRegions: [],
  backgroundColor: "#f7efe4",
  palette: [...DEFAULT_PALETTES[5]],
  page: { widthMm: 210, heightMm: 297 },
  marginMm: 14,
};

let sourceImage: HTMLImageElement | null = null;
let sourceFile: File | null = null;
let result: StencilResult | null = null;
let previewMode: PreviewMode = "composite";
let interactionTool: InteractionTool = "move";
let crop: CropTransform = { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0 };
let processTimer = 0;
let processGeneration = 0;
let toastTimer = 0;
let pointerStart: { x: number; y: number; offsetX: number; offsetY: number; moved: boolean } | null = null;

function formatNumber(value: number): string {
  return value.toLocaleString("en-GB", { maximumFractionDigits: 1 });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("en-GB", { maximumFractionDigits: 1 })} MB`;
}

function showError(message: string): void {
  elements.fileError.textContent = message;
  elements.fileError.hidden = false;
}

function clearError(): void {
  elements.fileError.hidden = true;
  elements.fileError.textContent = "";
}

function showToast(message: string): void {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2600);
}

function defaultPalette(count: LayerCount): string[] {
  return [...DEFAULT_PALETTES[count]];
}

function renderPalette(): void {
  elements.palette.innerHTML = "";
  settings.palette.slice(0, settings.layerCount).forEach((color, index) => {
    const row = document.createElement("label");
    row.className = "palette-row";
    const role = index === 0 ? "base silhouette" : index === settings.layerCount - 1 ? "key detail" : index === settings.layerCount - 2 ? "deep shadow" : "tone";
    row.innerHTML = `<span class="palette-order">${index + 1}</span><strong>Layer ${index + 1} · ${role}</strong><input type="color" value="${color}" aria-label="Color for layer ${index + 1}"><span>${color.toUpperCase()}</span>`;
    const input = row.querySelector<HTMLInputElement>("input");
    const value = row.querySelectorAll("span")[1];
    input?.addEventListener("input", () => {
      settings.palette[index] = input.value;
      if (value) value.textContent = input.value.toUpperCase();
      if (result?.layers[index]) result.layers[index]!.color = input.value;
      renderCurrentPreview();
      renderExports();
    });
    elements.palette.append(row);
  });

  const background = document.createElement("label");
  background.className = "palette-row";
  background.innerHTML = `<span class="palette-order">B</span><strong>Paper / background</strong><input type="color" value="${settings.backgroundColor}" aria-label="Paper and background color"><span>${settings.backgroundColor.toUpperCase()}</span>`;
  const input = background.querySelector<HTMLInputElement>("input");
  const value = background.querySelectorAll("span")[1];
  input?.addEventListener("input", () => {
    settings.backgroundColor = input.value;
    if (value) value.textContent = input.value.toUpperCase();
    renderCurrentPreview();
  });
  elements.palette.append(background);
}

function renderThumbnail(image: HTMLImageElement): void {
  const canvas = elements.thumbCanvas;
  canvas.width = 112;
  canvas.height = 112;
  const context = canvas.getContext("2d");
  if (!context) return;
  const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
}

async function loadFile(file: File): Promise<void> {
  clearError();
  const supported = ["image/jpeg", "image/png", "image/webp"];
  if (!supported.includes(file.type)) {
    showError("This format is not supported. Use JPG, PNG or WebP.");
    return;
  }
  if (file.size > 80 * 1024 * 1024) {
    showError("The image is larger than 80 MB. Choose a smaller file.");
    return;
  }
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The image could not be read."));
      image.src = objectUrl;
    });
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    showError(error instanceof Error ? error.message : "The image could not be read.");
    return;
  }
  URL.revokeObjectURL(objectUrl);
  sourceImage = image;
  sourceFile = file;
  result = null;
  crop = { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0 };
  settings.backgroundSample = null;
  settings.backgroundSeed = null;
  settings.backgroundRegions = [];
  elements.zoom.value = "100";
  updateOutputLabels();
  updateBackgroundSampleUi();
  elements.fileName.textContent = file.name;
  elements.fileMeta.textContent = `${image.naturalWidth} × ${image.naturalHeight} px · ${formatBytes(file.size)}`;
  elements.dropzone.hidden = true;
  elements.fileSummary.hidden = false;
  renderThumbnail(image);
  elements.stage.classList.remove("is-empty");
  elements.stage.classList.add("has-image");
  elements.emptyState.hidden = true;
  previewMode = "composite";
  scheduleProcessing(0);
}

function updateOutputLabels(): void {
  elements.zoomValue.textContent = `${Math.round(crop.zoom * 100)} %`;
  elements.toleranceValue.textContent = `${settings.backgroundTolerance}`;
  elements.contrastValue.textContent = `${settings.contrast} %`;
  elements.detailValue.textContent = `${settings.detail} %`;
  elements.edgeStrengthValue.textContent = `${settings.edgeStrength} %`;
  elements.shadowBiasValue.textContent = `${settings.shadowBias} %`;
  elements.minDetailValue.textContent = `${formatNumber(settings.minDetailMm)} mm`;
  elements.bridgeWidthValue.textContent = `${formatNumber(settings.bridgeWidthMm)} mm`;
}

function updateBackgroundSampleUi(): void {
  const sample = settings.backgroundSample;
  elements.clearSample.disabled = !sample;
  elements.sampleSwatch.classList.toggle("is-empty", !sample);
  if (sample) {
    elements.sampleSwatch.style.background = `rgb(${sample.join(",")})`;
    elements.sampleHelp.textContent = `${settings.backgroundRegions.length} area(s) · latest RGB ${sample.join(" · ")}`;
  } else {
    elements.sampleSwatch.style.removeProperty("background");
    elements.sampleHelp.textContent = "Choose the tool and click one or more background areas.";
  }
}

function setProcessing(active: boolean): void {
  elements.processing.hidden = !active;
  elements.previewCanvas.setAttribute("aria-busy", String(active));
}

function scheduleProcessing(delay = 120): void {
  if (!sourceImage) return;
  window.clearTimeout(processTimer);
  const generation = ++processGeneration;
  setProcessing(true);
  processTimer = window.setTimeout(() => {
    window.setTimeout(() => {
      if (!sourceImage || generation !== processGeneration) return;
      try {
        const canvas = renderSourceImage(sourceImage, crop, settings);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("The image could not be processed.");
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        result = processStencil(imageData, settings);
        if (generation !== processGeneration) return;
        updateResultUi();
      } catch (error) {
        showError(error instanceof Error ? error.message : "The image could not be processed.");
      } finally {
        if (generation === processGeneration) setProcessing(false);
      }
    }, 0);
  }, delay);
}

function renderPreviewTabs(): void {
  const tabs: Array<{ mode: PreviewMode; label: string }> = [
    { mode: "original", label: "Original" },
    { mode: "composite", label: "Composite" },
    ...Array.from({ length: settings.layerCount }, (_, index) => ({ mode: index, label: `Layer ${index + 1}` })),
  ];
  if (typeof previewMode === "number" && previewMode >= settings.layerCount) previewMode = "composite";
  elements.previewTabs.innerHTML = "";
  for (const tab of tabs) {
    const button = document.createElement("button");
    button.type = "button";
    button.role = "tab";
    button.textContent = tab.label;
    button.dataset.preview = String(tab.mode);
    const active = tab.mode === previewMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    button.addEventListener("click", () => {
      previewMode = tab.mode;
      renderPreviewTabs();
      renderCurrentPreview();
    });
    elements.previewTabs.append(button);
  }
}

function renderCurrentPreview(): void {
  if (!result) return;
  renderPreview(elements.previewCanvas, result, settings, previewMode);
  const modeLabel = typeof previewMode === "number" ? `stencil layer ${previewMode + 1}` : previewMode === "original" ? "original image" : "composite stencil";
  elements.previewCanvas.setAttribute("aria-label", `Preview of ${modeLabel}`);
}

function renderExports(): void {
  elements.layerExports.innerHTML = "";
  if (!result) return;
  result.layers.forEach((layer, index) => {
    const row = document.createElement("div");
    row.className = "layer-export";
    row.innerHTML = `<div class="layer-export-meta"><span class="layer-color" style="background:${layer.color}"></span><div><span class="file-kind">CUT FILE ${index + 1}</span><strong>${layer.label}</strong><small>${layer.bridges.length} bridge(s) added · paint color ${layer.color.toUpperCase()}</small></div></div><div class="export-actions"><button type="button" data-format="png">PNG</button><button type="button" data-format="svg">SVG</button></div>`;
    row.querySelectorAll<HTMLButtonElement>("button").forEach((button) => button.addEventListener("click", () => void exportLayer(index, button.dataset.format as "png" | "svg")));
    elements.layerExports.append(row);
  });
}

function updateResultUi(): void {
  if (!result) return;
  const summary = summarizeResult(result);
  renderPreviewTabs();
  renderCurrentPreview();
  renderExports();
  elements.resultPanel.hidden = false;
  elements.statLayers.textContent = String(result.layers.length);
  elements.statBridges.textContent = String(summary.totalBridges);
  elements.statFragments.textContent = String(summary.totalRemovedFragments);
  const warnings = result.layers.flatMap((layer) => layer.warnings.map((warning) => `${layer.label}: ${warning}`));
  elements.warningList.hidden = warnings.length === 0;
  elements.warningList.innerHTML = warnings.map((warning) => `<div>⚠ ${warning}</div>`).join("");
  elements.qualityBadge.className = `quality-badge ${warnings.length ? "is-warning" : "is-ready"}`;
  elements.qualityBadge.innerHTML = warnings.length ? `<span aria-hidden="true">!</span><strong>${warnings.length} check(s)</strong>` : `<span aria-hidden="true">●</span><strong>Ready to cut</strong>`;
}

function selectTool(tool: InteractionTool): void {
  interactionTool = tool;
  document.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((button) => button.classList.toggle("is-active", button.dataset.tool === tool));
  if (tool === "background") {
    previewMode = "original";
    elements.canvasHint.hidden = false;
    elements.canvasHint.textContent = "Click a flat background color inside the image";
    renderPreviewTabs();
    renderCurrentPreview();
  } else {
    elements.canvasHint.hidden = true;
  }
}

function applyPaperSize(): void {
  const preset = elements.paperPreset.value as PaperPreset;
  const orientation = elements.orientation.value as Orientation;
  const custom = preset === "custom";
  elements.pageWidth.disabled = !custom;
  elements.pageHeight.disabled = !custom;
  if (!custom) {
    const dimensions = preset === "A3" ? [297, 420] : [210, 297];
    const [short = 210, long = 297] = dimensions;
    settings.page.widthMm = orientation === "portrait" ? short : long;
    settings.page.heightMm = orientation === "portrait" ? long : short;
    elements.pageWidth.value = String(settings.page.widthMm);
    elements.pageHeight.value = String(settings.page.heightMm);
  } else {
    const first = clamp(Number(elements.pageWidth.value) || 210, 80, 2000);
    const second = clamp(Number(elements.pageHeight.value) || 297, 80, 2000);
    settings.page.widthMm = orientation === "portrait" ? Math.min(first, second) : Math.max(first, second);
    settings.page.heightMm = orientation === "portrait" ? Math.max(first, second) : Math.min(first, second);
    elements.pageWidth.value = String(settings.page.widthMm);
    elements.pageHeight.value = String(settings.page.heightMm);
  }
  crop.offsetX = 0;
  crop.offsetY = 0;
  scheduleProcessing(50);
}

function safeBaseName(): string {
  return (sourceFile?.name.replace(/\.[^.]+$/, "") ?? "stencil")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "stencil";
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportLayer(index: number, format: "png" | "svg"): Promise<void> {
  if (!result) return;
  try {
    if (format === "svg") {
      download(new Blob([createLayerSvg(result, settings, index)], { type: "image/svg+xml;charset=utf-8" }), `${safeBaseName()}-layer-${index + 1}.svg`);
    } else {
      const canvas = renderExportCanvas(result, settings, index);
      download(await canvasToBlob(canvas), `${safeBaseName()}-layer-${index + 1}.png`);
    }
    showToast(`Layer ${index + 1} was exported as ${format.toUpperCase()}.`);
  } catch (error) {
    showError(error instanceof Error ? error.message : "The export failed.");
  }
}

async function exportCompositePng(): Promise<void> {
  if (!result) return;
  try {
    download(await canvasToBlob(renderExportCanvas(result, settings, "composite")), `${safeBaseName()}-composite.png`);
    showToast("The composite PNG was exported.");
  } catch (error) {
    showError(error instanceof Error ? error.message : "The export failed.");
  }
}

function exportCombinedSvg(): void {
  if (!result) return;
  try {
    download(new Blob([createCombinedSvg(result, settings)], { type: "image/svg+xml;charset=utf-8" }), `${safeBaseName()}-combined.svg`);
    showToast("The combined SVG with named layers was exported.");
  } catch (error) {
    showError(error instanceof Error ? error.message : "The export failed.");
  }
}

function handleCanvasBackgroundSample(clientX: number, clientY: number): void {
  if (!result) return;
  const point = pagePointToSource(elements.previewCanvas, clientX, clientY, settings, result);
  if (!point) {
    showToast("Click inside the artwork area, not in the page margin.");
    return;
  }
  const offset = (point.y * result.width + point.x) * 4;
  settings.backgroundSample = [result.source.data[offset] ?? 0, result.source.data[offset + 1] ?? 0, result.source.data[offset + 2] ?? 0];
  settings.backgroundSeed = [point.x / Math.max(1, result.width - 1), point.y / Math.max(1, result.height - 1)];
  settings.backgroundRegions.push({ sample: [...settings.backgroundSample], seed: [...settings.backgroundSeed] });
  if (settings.backgroundRegions.length > 8) settings.backgroundRegions.shift();
  updateBackgroundSampleUi();
  scheduleProcessing(30);
}

elements.fileInput.addEventListener("change", () => {
  const file = elements.fileInput.files?.[0];
  if (file) void loadFile(file);
});
elements.replaceImage.addEventListener("click", () => {
  elements.fileInput.value = "";
  elements.fileInput.click();
});
elements.dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); elements.fileInput.click(); }
});
for (const eventName of ["dragenter", "dragover"]) {
  elements.dropzone.addEventListener(eventName, (event) => { event.preventDefault(); elements.dropzone.classList.add("is-dragging"); });
}
for (const eventName of ["dragleave", "drop"]) {
  elements.dropzone.addEventListener(eventName, (event) => { event.preventDefault(); elements.dropzone.classList.remove("is-dragging"); });
}
elements.dropzone.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files[0];
  if (file) void loadFile(file);
});

document.querySelectorAll<HTMLButtonElement>("[data-tool]").forEach((button) => button.addEventListener("click", () => selectTool(button.dataset.tool as InteractionTool)));
elements.zoom.addEventListener("input", () => { crop.zoom = Number(elements.zoom.value) / 100; updateOutputLabels(); scheduleProcessing(); });
elements.rotateLeft.addEventListener("click", () => { crop.rotation = ((crop.rotation + 270) % 360) as CropTransform["rotation"]; crop.offsetX = 0; crop.offsetY = 0; scheduleProcessing(30); });
elements.resetCrop.addEventListener("click", () => { crop = { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0 }; elements.zoom.value = "100"; updateOutputLabels(); scheduleProcessing(30); });
elements.clearSample.addEventListener("click", () => { settings.backgroundSample = null; settings.backgroundSeed = null; settings.backgroundRegions = []; updateBackgroundSampleUi(); scheduleProcessing(30); });
elements.tolerance.addEventListener("input", () => { settings.backgroundTolerance = Number(elements.tolerance.value); updateOutputLabels(); if (settings.backgroundRegions.length || settings.backgroundSample) scheduleProcessing(); });
elements.contrast.addEventListener("input", () => { settings.contrast = Number(elements.contrast.value); updateOutputLabels(); scheduleProcessing(); });
elements.detail.addEventListener("input", () => { settings.detail = Number(elements.detail.value); updateOutputLabels(); scheduleProcessing(); });
elements.edgeStrength.addEventListener("input", () => { settings.edgeStrength = Number(elements.edgeStrength.value); updateOutputLabels(); scheduleProcessing(); });
elements.shadowBias.addEventListener("input", () => { settings.shadowBias = Number(elements.shadowBias.value); updateOutputLabels(); scheduleProcessing(); });
elements.minDetail.addEventListener("input", () => { settings.minDetailMm = Number(elements.minDetail.value); updateOutputLabels(); scheduleProcessing(); });
elements.bridgeWidth.addEventListener("input", () => { settings.bridgeWidthMm = Number(elements.bridgeWidth.value); updateOutputLabels(); scheduleProcessing(); });

document.querySelectorAll<HTMLInputElement>('input[name="layer-count"]').forEach((input) => input.addEventListener("change", () => {
  settings.layerCount = Number(input.value) as LayerCount;
  settings.palette = defaultPalette(settings.layerCount);
  renderPalette();
  scheduleProcessing(30);
}));

document.querySelectorAll<HTMLButtonElement>("[data-profile]").forEach((button) => button.addEventListener("click", () => {
  settings.profile = button.dataset.profile === "classic" ? "classic" : "portrait";
  document.querySelectorAll<HTMLButtonElement>("[data-profile]").forEach((candidate) => {
    const active = candidate.dataset.profile === settings.profile;
    candidate.classList.toggle("is-active", active);
    candidate.setAttribute("aria-pressed", String(active));
  });
  scheduleProcessing(30);
}));

elements.paperPreset.addEventListener("change", applyPaperSize);
elements.orientation.addEventListener("change", applyPaperSize);
for (const input of [elements.pageWidth, elements.pageHeight]) input.addEventListener("change", applyPaperSize);

elements.previewCanvas.addEventListener("pointerdown", (event) => {
  if (!result) return;
  elements.previewCanvas.setPointerCapture(event.pointerId);
  pointerStart = { x: event.clientX, y: event.clientY, offsetX: crop.offsetX, offsetY: crop.offsetY, moved: false };
});
elements.previewCanvas.addEventListener("pointermove", (event) => {
  if (!pointerStart || interactionTool !== "move" || !result) return;
  const rect = elements.previewCanvas.getBoundingClientRect();
  const dx = (event.clientX - pointerStart.x) / rect.width * result.width;
  const dy = (event.clientY - pointerStart.y) / rect.height * result.height;
  if (Math.abs(dx) + Math.abs(dy) > 2) pointerStart.moved = true;
  crop.offsetX = clamp(pointerStart.offsetX + dx, -result.width * .55, result.width * .55);
  crop.offsetY = clamp(pointerStart.offsetY + dy, -result.height * .55, result.height * .55);
  scheduleProcessing(90);
});
elements.previewCanvas.addEventListener("pointerup", (event) => {
  if (!pointerStart) return;
  const wasClick = !pointerStart.moved;
  pointerStart = null;
  if (interactionTool === "background" && wasClick) handleCanvasBackgroundSample(event.clientX, event.clientY);
  else if (interactionTool === "move") scheduleProcessing(10);
});
elements.previewCanvas.addEventListener("pointercancel", () => { pointerStart = null; });
elements.previewCanvas.addEventListener("keydown", (event) => {
  if (interactionTool !== "move" || !result || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
  event.preventDefault();
  const amount = event.shiftKey ? 20 : 5;
  if (event.key === "ArrowLeft") crop.offsetX -= amount;
  if (event.key === "ArrowRight") crop.offsetX += amount;
  if (event.key === "ArrowUp") crop.offsetY -= amount;
  if (event.key === "ArrowDown") crop.offsetY += amount;
  scheduleProcessing(40);
});

elements.exportCompositePng.addEventListener("click", () => void exportCompositePng());
elements.exportCombinedSvg.addEventListener("click", exportCombinedSvg);

window.addEventListener("error", (event) => showError(`Unexpected error: ${event.message}`));
renderPalette();
updateOutputLabels();
updateBackgroundSampleUi();
