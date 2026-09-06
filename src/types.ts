export type LayerCount = 3 | 4 | 5;
export type Orientation = "portrait" | "landscape";
export type PaperPreset = "A4" | "A3" | "custom";
export type PreviewMode = "original" | "composite" | number;
export type InteractionTool = "move" | "background";
export type ProcessingProfile = "portrait" | "classic";

export interface PageSize {
  widthMm: number;
  heightMm: number;
}

export interface CropTransform {
  zoom: number;
  offsetX: number;
  offsetY: number;
  rotation: 0 | 90 | 180 | 270;
}

export interface StencilSettings {
  layerCount: LayerCount;
  profile: ProcessingProfile;
  contrast: number;
  detail: number;
  edgeStrength: number;
  shadowBias: number;
  minDetailMm: number;
  bridgeWidthMm: number;
  backgroundTolerance: number;
  backgroundSample: [number, number, number] | null;
  backgroundSeed: [number, number] | null;
  backgroundRegions: Array<{ sample: [number, number, number]; seed: [number, number] }>;
  backgroundColor: string;
  palette: string[];
  page: PageSize;
  marginMm: number;
}

export interface BridgeInfo {
  x: number;
  y: number;
  lengthPx: number;
}

export interface StencilLayer {
  index: number;
  label: string;
  color: string;
  mask: Uint8Array;
  bridges: BridgeInfo[];
  removedFragments: number;
  floatingIslands: number;
  warnings: string[];
}

export interface StencilResult {
  width: number;
  height: number;
  source: ImageData;
  thresholds: number[];
  layers: StencilLayer[];
  backgroundMask: Uint8Array;
}

export interface ProcessingStats {
  thresholdLabels: string[];
  totalBridges: number;
  totalRemovedFragments: number;
  warningCount: number;
}
