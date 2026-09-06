import { hexToRgb, maskToSvgPath } from "./engine";
import type { CropTransform, PreviewMode, StencilResult, StencilSettings } from "./types";

const PREVIEW_EDGE = 900;
const PROCESS_EDGE = 820;

function fitDimensions(width: number, height: number, maximumEdge: number): { width: number; height: number } {
  if (width >= height) return { width: maximumEdge, height: Math.max(120, Math.round(maximumEdge * height / width)) };
  return { width: Math.max(120, Math.round(maximumEdge * width / height)), height: maximumEdge };
}

export function processingDimensions(settings: StencilSettings): { width: number; height: number } {
  const contentWidth = Math.max(1, settings.page.widthMm - settings.marginMm * 2);
  const contentHeight = Math.max(1, settings.page.heightMm - settings.marginMm * 2);
  return fitDimensions(contentWidth, contentHeight, PROCESS_EDGE);
}

export function renderSourceImage(image: HTMLImageElement, crop: CropTransform, settings: StencilSettings, target?: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = target ?? document.createElement("canvas");
  const dimensions = processingDimensions(settings);
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("The browser could not initialize the image canvas.");
  context.clearRect(0, 0, canvas.width, canvas.height);

  const isQuarterTurn = crop.rotation === 90 || crop.rotation === 270;
  const rotatedWidth = isQuarterTurn ? image.naturalHeight : image.naturalWidth;
  const rotatedHeight = isQuarterTurn ? image.naturalWidth : image.naturalHeight;
  const coverScale = Math.max(canvas.width / rotatedWidth, canvas.height / rotatedHeight);
  const scale = coverScale * crop.zoom;
  context.save();
  context.translate(canvas.width / 2 + crop.offsetX, canvas.height / 2 + crop.offsetY);
  context.rotate(crop.rotation * Math.PI / 180);
  context.scale(scale, scale);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  context.restore();
  return canvas;
}

function drawRegistrationMarks(context: CanvasRenderingContext2D, pageWidth: number, pageHeight: number, marginPx: number, color = "#111111"): void {
  const inset = Math.max(10, marginPx * .48);
  const radius = Math.max(5, marginPx * .16);
  const points = [[inset, inset], [pageWidth - inset, inset], [inset, pageHeight - inset]];
  context.save();
  context.strokeStyle = color;
  context.lineWidth = Math.max(1.2, radius * .13);
  for (const [x = 0, y = 0] of points) {
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.moveTo(x - radius * 1.5, y);
    context.lineTo(x + radius * 1.5, y);
    context.moveTo(x, y - radius * 1.5);
    context.lineTo(x, y + radius * 1.5);
    context.stroke();
  }
  context.restore();
}

function paintArtwork(context: CanvasRenderingContext2D, result: StencilResult, settings: StencilSettings, mode: PreviewMode, x: number, y: number, width: number, height: number): void {
  const artwork = document.createElement("canvas");
  artwork.width = result.width;
  artwork.height = result.height;
  const artworkContext = artwork.getContext("2d");
  if (!artworkContext) return;

  if (mode === "original") {
    artworkContext.putImageData(result.source, 0, 0);
  } else {
    const pixels = artworkContext.createImageData(result.width, result.height);
    const background = hexToRgb(mode === "composite" ? settings.backgroundColor : "#fffefa");
    for (let pixel = 0; pixel < result.width * result.height; pixel += 1) {
      let color = background;
      if (mode === "composite") {
        for (const layer of result.layers) {
          if (layer.mask[pixel]) color = hexToRgb(layer.color);
        }
      } else {
        const layer = result.layers[mode];
        if (layer?.mask[pixel]) color = [17, 17, 17];
      }
      const offset = pixel * 4;
      pixels.data[offset] = color[0];
      pixels.data[offset + 1] = color[1];
      pixels.data[offset + 2] = color[2];
      pixels.data[offset + 3] = 255;
    }
    artworkContext.putImageData(pixels, 0, 0);
  }
  context.imageSmoothingEnabled = mode === "original";
  context.drawImage(artwork, x, y, width, height);

  if (typeof mode === "number") {
    const layer = result.layers[mode];
    if (layer?.bridges.length) {
      context.save();
      context.strokeStyle = "#dc5b3f";
      context.fillStyle = "#d8ff48";
      context.lineWidth = Math.max(1, width / result.width * 1.4);
      for (const bridge of layer.bridges.slice(0, 80)) {
        const bx = x + bridge.x / result.width * width;
        const by = y + bridge.y / result.height * height;
        const radius = Math.max(2.5, width / result.width * 3);
        context.beginPath();
        context.arc(bx, by, radius, 0, Math.PI * 2);
        context.fill();
        context.stroke();
      }
      context.restore();
    }
  }
}

export function renderPreview(canvas: HTMLCanvasElement, result: StencilResult, settings: StencilSettings, mode: PreviewMode): void {
  const dimensions = fitDimensions(settings.page.widthMm, settings.page.heightMm, PREVIEW_EDGE);
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.fillStyle = "#fffefa";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const scaleX = canvas.width / settings.page.widthMm;
  const scaleY = canvas.height / settings.page.heightMm;
  const marginX = settings.marginMm * scaleX;
  const marginY = settings.marginMm * scaleY;
  const contentWidth = canvas.width - marginX * 2;
  const contentHeight = canvas.height - marginY * 2;
  paintArtwork(context, result, settings, mode, marginX, marginY, contentWidth, contentHeight);
  drawRegistrationMarks(context, canvas.width, canvas.height, Math.min(marginX, marginY));

  context.save();
  context.fillStyle = "#34342f";
  context.font = `700 ${Math.max(8, canvas.width * .012)}px Segoe UI, sans-serif`;
  context.textAlign = "right";
  const label = typeof mode === "number" ? `LAYER ${mode + 1} · ${result.layers[mode]?.color.toUpperCase() ?? ""}` : mode === "original" ? "ORIGINAL · NOT A CUT FILE" : "COMPOSITE PREVIEW";
  context.fillText(label, canvas.width - marginX * .45, canvas.height - marginY * .28);
  context.restore();
}

export function pagePointToSource(canvas: HTMLCanvasElement, clientX: number, clientY: number, settings: StencilSettings, result: StencilResult): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  const canvasX = (clientX - rect.left) / rect.width * canvas.width;
  const canvasY = (clientY - rect.top) / rect.height * canvas.height;
  const marginX = settings.marginMm / settings.page.widthMm * canvas.width;
  const marginY = settings.marginMm / settings.page.heightMm * canvas.height;
  const contentWidth = canvas.width - marginX * 2;
  const contentHeight = canvas.height - marginY * 2;
  if (canvasX < marginX || canvasY < marginY || canvasX > marginX + contentWidth || canvasY > marginY + contentHeight) return null;
  return {
    x: Math.min(result.width - 1, Math.max(0, Math.floor((canvasX - marginX) / contentWidth * result.width))),
    y: Math.min(result.height - 1, Math.max(0, Math.floor((canvasY - marginY) / contentHeight * result.height))),
  };
}

function registrationSvg(pageWidth: number, pageHeight: number, margin: number, color: string): string {
  const inset = margin * .48;
  const radius = Math.max(1.8, margin * .16);
  const points = [[inset, inset], [pageWidth - inset, inset], [inset, pageHeight - inset]];
  return points.map(([x = 0, y = 0]) => `<g transform="translate(${x.toFixed(3)} ${y.toFixed(3)})"><circle r="${radius.toFixed(3)}" fill="none" stroke="${color}" stroke-width="0.5"/><path d="M${(-radius * 1.5).toFixed(3)} 0H${(radius * 1.5).toFixed(3)}M0 ${(-radius * 1.5).toFixed(3)}V${(radius * 1.5).toFixed(3)}" fill="none" stroke="${color}" stroke-width="0.5"/></g>`).join("");
}

function svgHeader(settings: StencilSettings, description: string): string {
  const { widthMm, heightMm } = settings.page;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}" role="img"><title>Stencil Builder</title><desc>${description}</desc>`;
}

function artworkTransform(result: StencilResult, settings: StencilSettings): string {
  const contentWidth = settings.page.widthMm - settings.marginMm * 2;
  const contentHeight = settings.page.heightMm - settings.marginMm * 2;
  return `translate(${settings.marginMm} ${settings.marginMm}) scale(${contentWidth / result.width} ${contentHeight / result.height})`;
}

export function createLayerSvg(result: StencilResult, settings: StencilSettings, layerIndex: number): string {
  const layer = result.layers[layerIndex];
  if (!layer) throw new Error("The layer does not exist.");
  const path = maskToSvgPath(layer.mask, result.width, result.height);
  const { widthMm, heightMm } = settings.page;
  return `${svgHeader(settings, `Cut file for layer ${layerIndex + 1}. Paint color ${layer.color}.`)}<rect width="${widthMm}" height="${heightMm}" fill="#fff"/><g id="registration-marks">${registrationSvg(widthMm, heightMm, settings.marginMm, "#111")}</g><g id="layer-${layerIndex + 1}-cut" transform="${artworkTransform(result, settings)}" fill="#111" fill-rule="evenodd"><path d="${path}"/></g><g id="information" fill="#333" font-family="Arial,sans-serif" font-size="3.5"><text x="${widthMm - settings.marginMm * .45}" y="${heightMm - settings.marginMm * .28}" text-anchor="end">LAYER ${layerIndex + 1} · ${layer.color.toUpperCase()}</text></g></svg>`;
}

export function createCombinedSvg(result: StencilResult, settings: StencilSettings): string {
  const { widthMm, heightMm } = settings.page;
  const groups = result.layers.map((layer) => `<g id="layer-${layer.index + 1}" transform="${artworkTransform(result, settings)}" fill="${layer.color}" fill-rule="evenodd"><path d="${maskToSvgPath(layer.mask, result.width, result.height)}"/></g>`).join("");
  return `${svgHeader(settings, "Combined color preview with named stencil layers.")}<rect width="${widthMm}" height="${heightMm}" fill="${settings.backgroundColor}"/>${groups}<g id="registration-marks">${registrationSvg(widthMm, heightMm, settings.marginMm, "#111")}</g><g id="information" fill="#333" font-family="Arial,sans-serif" font-size="3.5"><text x="${widthMm - settings.marginMm * .45}" y="${heightMm - settings.marginMm * .28}" text-anchor="end">COMPOSITE PREVIEW · ${result.layers.length} LAYERS</text></g></svg>`;
}

export function renderExportCanvas(result: StencilResult, settings: StencilSettings, mode: "composite" | number): HTMLCanvasElement {
  const desiredPixelsPerMm = 150 / 25.4;
  const maximumEdge = 6000;
  const scale = Math.min(desiredPixelsPerMm, maximumEdge / Math.max(settings.page.widthMm, settings.page.heightMm));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(settings.page.widthMm * scale));
  canvas.height = Math.max(1, Math.round(settings.page.heightMm * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The browser could not create the export canvas.");
  context.fillStyle = mode === "composite" ? settings.backgroundColor : "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const marginX = settings.marginMm * scale;
  const marginY = settings.marginMm * scale;
  paintArtwork(context, result, settings, mode, marginX, marginY, canvas.width - marginX * 2, canvas.height - marginY * 2);
  drawRegistrationMarks(context, canvas.width, canvas.height, Math.min(marginX, marginY));
  context.fillStyle = "#333";
  context.font = `700 ${Math.max(11, 3.5 * scale)}px Arial, sans-serif`;
  context.textAlign = "right";
  const label = mode === "composite" ? `COMPOSITE PREVIEW · ${result.layers.length} LAYERS` : `LAYER ${mode + 1} · ${result.layers[mode]?.color.toUpperCase() ?? ""}`;
  context.fillText(label, canvas.width - marginX * .45, canvas.height - marginY * .28);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The PNG file could not be created.")), "image/png"));
}
