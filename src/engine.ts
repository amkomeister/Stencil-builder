import type { BridgeInfo, ProcessingStats, StencilLayer, StencilResult, StencilSettings } from "./types";

const DIRECTIONS = [-1, 1, 0, 0] as const;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized.length === 3
    ? normalized.split("").map((part) => part + part).join("")
    : normalized, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function boxBlur(input: Float32Array, width: number, height: number, radius: number): Float32Array {
  if (radius <= 0) return input.slice();
  const horizontal = new Float32Array(input.length);
  const output = new Float32Array(input.length);

  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    const row = y * width;
    for (let x = -radius; x <= radius; x += 1) {
      sum += input[row + clamp(x, 0, width - 1)] ?? 0;
    }
    for (let x = 0; x < width; x += 1) {
      horizontal[row + x] = sum / (radius * 2 + 1);
      sum -= input[row + clamp(x - radius, 0, width - 1)] ?? 0;
      sum += input[row + clamp(x + radius + 1, 0, width - 1)] ?? 0;
    }
  }

  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = -radius; y <= radius; y += 1) {
      sum += horizontal[clamp(y, 0, height - 1) * width + x] ?? 0;
    }
    for (let y = 0; y < height; y += 1) {
      output[y * width + x] = sum / (radius * 2 + 1);
      sum -= horizontal[clamp(y - radius, 0, height - 1) * width + x] ?? 0;
      sum += horizontal[clamp(y + radius + 1, 0, height - 1) * width + x] ?? 0;
    }
  }
  return output;
}

export function calculateToneThresholds(values: ArrayLike<number>, count: number): number[] {
  if (values.length === 0) return Array.from({ length: count - 1 }, (_, index) => ((index + 1) * 255) / count);
  const histogram = new Uint32Array(256);
  for (let index = 0; index < values.length; index += 1) {
    const bucket = clamp(Math.round(values[index] ?? 0), 0, 255);
    histogram[bucket] = (histogram[bucket] ?? 0) + 1;
  }

  let minimum = 0;
  let maximum = 255;
  while (minimum < 255 && histogram[minimum] === 0) minimum += 1;
  while (maximum > 0 && histogram[maximum] === 0) maximum -= 1;

  const centers = Array.from({ length: count }, (_, index) => minimum + ((maximum - minimum) * (index + .5)) / count);
  const totals = new Float64Array(count);
  const weighted = new Float64Array(count);

  for (let iteration = 0; iteration < 18; iteration += 1) {
    totals.fill(0);
    weighted.fill(0);
    for (let value = minimum; value <= maximum; value += 1) {
      const frequency = histogram[value] ?? 0;
      if (!frequency) continue;
      let best = 0;
      let distance = Math.abs(value - (centers[0] ?? 0));
      for (let cluster = 1; cluster < count; cluster += 1) {
        const nextDistance = Math.abs(value - (centers[cluster] ?? 0));
        if (nextDistance < distance) {
          best = cluster;
          distance = nextDistance;
        }
      }
      totals[best] = (totals[best] ?? 0) + frequency;
      weighted[best] = (weighted[best] ?? 0) + frequency * value;
    }
    for (let cluster = 0; cluster < count; cluster += 1) {
      const total = totals[cluster] ?? 0;
      if (total > 0) centers[cluster] = (weighted[cluster] ?? 0) / total;
    }
    centers.sort((a, b) => a - b);
  }

  return centers.slice(0, -1).map((center, index) => (center + (centers[index + 1] ?? center)) / 2);
}

export function calculatePortraitThresholds(values: ArrayLike<number>, count: number, shadowBias: number): number[] {
  if (values.length === 0) return Array.from({ length: count - 1 }, (_, index) => ((index + 1) * 255) / count);
  const histogram = new Uint32Array(256);
  for (let index = 0; index < values.length; index += 1) {
    histogram[clamp(Math.round(values[index] ?? 0), 0, 255)]! += 1;
  }
  const bias = (clamp(shadowBias, 0, 100) - 50) / 250;
  const thresholds: number[] = [];
  for (let index = 1; index < count; index += 1) {
    const base = index / count;
    const quantile = clamp(base + bias * Math.sin(Math.PI * base), .06, .94);
    const target = values.length * quantile;
    let running = 0;
    let value = 0;
    for (; value < 255; value += 1) {
      running += histogram[value] ?? 0;
      if (running >= target) break;
    }
    thresholds.push(value);
  }
  return thresholds;
}

function floodBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  sample: [number, number, number],
  seed: [number, number] | null,
  tolerance: number,
  backgroundMask: Uint8Array,
): void {
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const visited = new Uint8Array(width * height);
  const colorLimit = tolerance * 3.15;
  const matches = (index: number): boolean => {
    const offset = index * 4;
    const red = data[offset] ?? 0;
    const green = data[offset + 1] ?? 0;
    const blue = data[offset + 2] ?? 0;
    const dr = red - sample[0];
    const dg = green - sample[1];
    const db = blue - sample[2];
    return Math.sqrt(dr * dr * .85 + dg * dg * 1.2 + db * db * .95) <= colorLimit;
  };
  const enqueue = (index: number, force = false): void => {
    if (index < 0 || index >= visited.length || visited[index]) return;
    visited[index] = 1;
    if (!force && !matches(index)) return;
    backgroundMask[index] = 1;
    queue[tail++] = index;
  };

  if (seed) {
    const sx = clamp(Math.round(seed[0] * (width - 1)), 0, width - 1);
    const sy = clamp(Math.round(seed[1] * (height - 1)), 0, height - 1);
    enqueue(sy * width + sx, true);
  }
  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  while (head < tail) {
    const current = queue[head++] ?? 0;
    const x = current % width;
    const y = Math.floor(current / width);
    if (x > 0) enqueue(current - 1);
    if (x + 1 < width) enqueue(current + 1);
    if (y > 0) enqueue(current - width);
    if (y + 1 < height) enqueue(current + width);
  }
}

function removeSmallComponents(mask: Uint8Array, width: number, height: number, minimumArea: number): number {
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let removed = 0;

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const current = queue[head++] ?? 0;
      const x = current % width;
      const y = Math.floor(current / width);
      if (x > 0) {
        const next = current - 1;
        if (mask[next] && !visited[next]) { visited[next] = 1; queue[tail++] = next; }
      }
      if (x + 1 < width) {
        const next = current + 1;
        if (mask[next] && !visited[next]) { visited[next] = 1; queue[tail++] = next; }
      }
      if (y > 0) {
        const next = current - width;
        if (mask[next] && !visited[next]) { visited[next] = 1; queue[tail++] = next; }
      }
      if (y + 1 < height) {
        const next = current + width;
        if (mask[next] && !visited[next]) { visited[next] = 1; queue[tail++] = next; }
      }
    }
    if (tail < minimumArea) {
      for (let offset = 0; offset < tail; offset += 1) mask[queue[offset] ?? 0] = 0;
      removed += 1;
    }
  }
  return removed;
}

interface MaterialAnalysis {
  connected: Uint8Array;
  islands: number[][];
}

function analyzeMaterial(mask: Uint8Array, width: number, height: number): MaterialAnalysis {
  const connected = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let head = 0;
  let tail = 0;
  const enqueue = (index: number): void => {
    if (!mask[index] && !connected[index]) {
      connected[index] = 1;
      queue[tail++] = index;
    }
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  while (head < tail) {
    const current = queue[head++] ?? 0;
    const x = current % width;
    const y = Math.floor(current / width);
    if (x > 0) enqueue(current - 1);
    if (x + 1 < width) enqueue(current + 1);
    if (y > 0) enqueue(current - width);
    if (y + 1 < height) enqueue(current + width);
  }

  const visited = connected.slice();
  const islands: number[][] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] || visited[start]) continue;
    const pixels: number[] = [];
    head = 0;
    tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const current = queue[head++] ?? 0;
      pixels.push(current);
      const x = current % width;
      const y = Math.floor(current / width);
      const neighbors = [x > 0 ? current - 1 : -1, x + 1 < width ? current + 1 : -1, y > 0 ? current - width : -1, y + 1 < height ? current + width : -1];
      for (const next of neighbors) {
        if (next >= 0 && !mask[next] && !visited[next]) { visited[next] = 1; queue[tail++] = next; }
      }
    }
    islands.push(pixels);
  }
  return { connected, islands };
}

function fillTinyMaterialIslands(mask: Uint8Array, width: number, height: number, maximumArea: number): number {
  const analysis = analyzeMaterial(mask, width, height);
  let filled = 0;
  for (const island of analysis.islands) {
    if (island.length >= maximumArea) continue;
    for (const pixel of island) mask[pixel] = 1;
    filled += 1;
  }
  return filled;
}

function carveDisc(mask: Uint8Array, width: number, height: number, center: number, radius: number): void {
  const cx = center % width;
  const cy = Math.floor(center / width);
  const squaredRadius = radius * radius;
  for (let y = Math.max(0, cy - radius); y <= Math.min(height - 1, cy + radius); y += 1) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(width - 1, cx + radius); x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= squaredRadius) mask[y * width + x] = 0;
    }
  }
}

export function autoBridgeMaterial(mask: Uint8Array, width: number, height: number, bridgeWidthPx: number, maximumBridges = 80): { bridges: BridgeInfo[]; floatingIslands: number } {
  const analysis = analyzeMaterial(mask, width, height);
  const targets = analysis.islands
    .sort((a, b) => b.length - a.length)
    .slice(0, maximumBridges);
  if (!targets.length) return { bridges: [], floatingIslands: 0 };

  const distance = new Int32Array(mask.length);
  distance.fill(-1);
  const queue = new Int32Array(mask.length);
  let head = 0;
  let tail = 0;
  for (let index = 0; index < analysis.connected.length; index += 1) {
    if (analysis.connected[index]) {
      distance[index] = 0;
      queue[tail++] = index;
    }
  }
  while (head < tail) {
    const current = queue[head++] ?? 0;
    const x = current % width;
    const y = Math.floor(current / width);
    const nextDistance = (distance[current] ?? 0) + 1;
    const neighbors = [x > 0 ? current - 1 : -1, x + 1 < width ? current + 1 : -1, y > 0 ? current - width : -1, y + 1 < height ? current + width : -1];
    for (const next of neighbors) {
      if (next >= 0 && (distance[next] ?? -1) < 0) { distance[next] = nextDistance; queue[tail++] = next; }
    }
  }

  const bridges: BridgeInfo[] = [];
  const radius = Math.max(1, Math.round(bridgeWidthPx / 2));
  for (const island of targets) {
    let current = island[0] ?? 0;
    for (const pixel of island) {
      if ((distance[pixel] ?? Number.MAX_SAFE_INTEGER) < (distance[current] ?? Number.MAX_SAFE_INTEGER)) current = pixel;
    }
    const start = current;
    let length = 0;
    while ((distance[current] ?? 0) > 0 && length < width + height) {
      carveDisc(mask, width, height, current, radius);
      const x = current % width;
      const y = Math.floor(current / width);
      const neighbors = [x > 0 ? current - 1 : -1, x + 1 < width ? current + 1 : -1, y > 0 ? current - width : -1, y + 1 < height ? current + width : -1];
      let best = current;
      for (const next of neighbors) {
        const nextDistance = next >= 0 ? (distance[next] ?? -1) : -1;
        if (nextDistance >= 0 && nextDistance < (distance[best] ?? Number.MAX_SAFE_INTEGER)) best = next;
      }
      if (best === current) break;
      current = best;
      length += 1;
    }
    carveDisc(mask, width, height, current, radius);
    bridges.push({ x: start % width, y: Math.floor(start / width), lengthPx: length });
  }
  return { bridges, floatingIslands: analyzeMaterial(mask, width, height).islands.length };
}

export function processStencil(source: ImageData, settings: StencilSettings): StencilResult {
  const { width, height, data } = source;
  const pixels = width * height;
  const rawLuminance = new Float32Array(pixels);
  const backgroundMask = new Uint8Array(pixels);
  const sample = settings.backgroundSample;

  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const offset = pixel * 4;
    const red = data[offset] ?? 0;
    const green = data[offset + 1] ?? 0;
    const blue = data[offset + 2] ?? 0;
    const alpha = data[offset + 3] ?? 255;
    rawLuminance[pixel] = .2126 * red + .7152 * green + .0722 * blue;
    if (alpha < 24) {
      backgroundMask[pixel] = 1;
    }
  }

  if (settings.backgroundRegions.length) {
    for (const region of settings.backgroundRegions) {
      floodBackground(data, width, height, region.sample, region.seed, settings.backgroundTolerance, backgroundMask);
    }
  } else if (sample) {
    floodBackground(data, width, height, sample, settings.backgroundSeed, settings.backgroundTolerance, backgroundMask);
  }

  const blurRadius = Math.round(1 + ((100 - settings.detail) / 100) * 3);
  const blurred = boxBlur(rawLuminance, width, height, blurRadius);
  const localBlur = settings.profile === "portrait" ? boxBlur(rawLuminance, width, height, Math.max(3, blurRadius * 3)) : blurred;
  const luminance = new Float32Array(pixels);
  const sourceMix = .3 + settings.detail / 155;
  const contrast = settings.contrast / 100;
  const edgeMix = settings.profile === "portrait" ? settings.edgeStrength / 115 : 0;
  const foregroundValues: number[] = [];
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const mixed = (blurred[pixel] ?? 0) * (1 - sourceMix) + (rawLuminance[pixel] ?? 0) * sourceMix;
    const localDetail = (rawLuminance[pixel] ?? 0) - (localBlur[pixel] ?? 0);
    const adjusted = clamp((mixed + localDetail * edgeMix - 128) * contrast + 128, 0, 255);
    luminance[pixel] = adjusted;
    if (!backgroundMask[pixel]) foregroundValues.push(adjusted);
  }

  const thresholds = settings.profile === "portrait"
    ? calculatePortraitThresholds(foregroundValues, settings.layerCount, settings.shadowBias)
    : calculateToneThresholds(foregroundValues, settings.layerCount);
  const masks = Array.from({ length: settings.layerCount }, () => new Uint8Array(pixels));
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    if (backgroundMask[pixel]) continue;
    const value = luminance[pixel] ?? 0;
    if (settings.profile === "portrait") {
      masks[0]![pixel] = 1;
      for (let layer = 1; layer < settings.layerCount; layer += 1) {
        const thresholdIndex = thresholds.length - layer;
        if (value <= (thresholds[thresholdIndex] ?? 255)) masks[layer]![pixel] = 1;
      }
    } else {
      let layer = 0;
      while (layer < thresholds.length && value > (thresholds[layer] ?? 255)) layer += 1;
      masks[layer]![pixel] = 1;
    }
  }

  const contentWidthMm = Math.max(1, settings.page.widthMm - settings.marginMm * 2);
  const contentHeightMm = Math.max(1, settings.page.heightMm - settings.marginMm * 2);
  const pixelsPerMm = Math.min(width / contentWidthMm, height / contentHeightMm);
  const minimumArea = Math.max(2, Math.round(Math.pow(settings.minDetailMm * pixelsPerMm, 2) * .46));
  const bridgeWidthPx = Math.max(2, settings.bridgeWidthMm * pixelsPerMm);
  const layers: StencilLayer[] = masks.map((mask, index) => {
    const detailScale = settings.profile === "portrait" ? Math.max(.42, 1 - index * .12) : 1;
    const layerMinimumArea = Math.max(2, Math.round(minimumArea * detailScale));
    const removedPaint = removeSmallComponents(mask, width, height, layerMinimumArea);
    const portraitFillFactors = [pixels + 1, minimumArea * 900, minimumArea * 300, minimumArea * 120, minimumArea * 45];
    const fillArea = settings.profile === "portrait"
      ? Math.max(2, Math.round(portraitFillFactors[index] ?? minimumArea * 45))
      : Math.max(2, layerMinimumArea);
    const filledHoles = fillTinyMaterialIslands(mask, width, height, fillArea);
    const maximumBridges = settings.profile === "portrait" ? 160 : 80;
    const bridgeResult = autoBridgeMaterial(mask, width, height, bridgeWidthPx, maximumBridges);
    const warnings: string[] = [];
    const paintedPixels = mask.reduce((total, value) => total + value, 0);
    if (paintedPixels < pixels * .002) warnings.push("This layer has very little paint area.");
    if (bridgeResult.floatingIslands > 0) warnings.push(`${bridgeResult.floatingIslands} floating material island(s) need review.`);
    if (bridgeResult.bridges.length >= maximumBridges) warnings.push("Many islands detected: try less detail or wider bridges.");
    return {
      index,
      label: settings.profile === "portrait"
        ? ["Base silhouette", "Light tone", "Midtone", "Deep shadow", "Key detail"][index] ?? `Layer ${index + 1}`
        : `Layer ${index + 1}`,
      color: settings.palette[index] ?? "#111111",
      mask,
      bridges: bridgeResult.bridges,
      removedFragments: removedPaint + filledHoles,
      floatingIslands: bridgeResult.floatingIslands,
      warnings,
    };
  });

  return { width, height, source, thresholds, layers, backgroundMask };
}

function removeCollinear(points: number[]): number[] {
  if (points.length < 8) return points;
  const cleaned: number[] = [];
  const pointCount = points.length / 2;
  for (let index = 0; index < pointCount; index += 1) {
    const previous = (index - 1 + pointCount) % pointCount;
    const next = (index + 1) % pointCount;
    const px = points[previous * 2] ?? 0;
    const py = points[previous * 2 + 1] ?? 0;
    const cx = points[index * 2] ?? 0;
    const cy = points[index * 2 + 1] ?? 0;
    const nx = points[next * 2] ?? 0;
    const ny = points[next * 2 + 1] ?? 0;
    if ((cx - px) * (ny - cy) !== (cy - py) * (nx - cx)) cleaned.push(cx, cy);
  }
  return cleaned.length >= 6 ? cleaned : points;
}

export function maskToSvgPath(mask: Uint8Array, width: number, height: number): string {
  const stride = width + 1;
  const outgoing = new Map<number, number[]>();
  const addEdge = (sx: number, sy: number, ex: number, ey: number): void => {
    const start = sy * stride + sx;
    const end = ey * stride + ex;
    const edges = outgoing.get(start);
    if (edges) edges.push(end);
    else outgoing.set(start, [end]);
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!mask[index]) continue;
      if (y === 0 || !mask[index - width]) addEdge(x, y, x + 1, y);
      if (x === width - 1 || !mask[index + 1]) addEdge(x + 1, y, x + 1, y + 1);
      if (y === height - 1 || !mask[index + width]) addEdge(x + 1, y + 1, x, y + 1);
      if (x === 0 || !mask[index - 1]) addEdge(x, y + 1, x, y);
    }
  }

  const popEdge = (start: number, incomingDirection: number | null): number | null => {
    const candidates = outgoing.get(start);
    if (!candidates?.length) return null;
    let selectedIndex = 0;
    if (incomingDirection !== null && candidates.length > 1) {
      const sx = start % stride;
      const sy = Math.floor(start / stride);
      const priorities = [1, 0, 3, 2];
      let selectedPriority = Number.MAX_SAFE_INTEGER;
      candidates.forEach((end, index) => {
        const ex = end % stride;
        const ey = Math.floor(end / stride);
        const direction = ex > sx ? 0 : ey > sy ? 1 : ex < sx ? 2 : 3;
        const turn = (direction - incomingDirection + 4) % 4;
        const priority = priorities.indexOf(turn);
        if (priority < selectedPriority) { selectedPriority = priority; selectedIndex = index; }
      });
    }
    const [end] = candidates.splice(selectedIndex, 1);
    if (!candidates.length) outgoing.delete(start);
    return end ?? null;
  };

  const paths: string[] = [];
  let safety = 0;
  while (outgoing.size && safety < mask.length * 8) {
    safety += 1;
    const start = outgoing.keys().next().value as number | undefined;
    if (start === undefined) break;
    const points: number[] = [start % stride, Math.floor(start / stride)];
    let current = start;
    let incoming: number | null = null;
    let loopSafety = 0;
    while (loopSafety < mask.length * 4) {
      loopSafety += 1;
      const next = popEdge(current, incoming);
      if (next === null) break;
      const cx = current % stride;
      const cy = Math.floor(current / stride);
      const nx = next % stride;
      const ny = Math.floor(next / stride);
      incoming = nx > cx ? 0 : ny > cy ? 1 : nx < cx ? 2 : 3;
      current = next;
      if (current === start) break;
      points.push(nx, ny);
    }
    const cleaned = removeCollinear(points);
    if (cleaned.length >= 6) {
      let path = `M${cleaned[0]} ${cleaned[1]}`;
      for (let index = 2; index < cleaned.length; index += 2) path += `L${cleaned[index]} ${cleaned[index + 1]}`;
      paths.push(`${path}Z`);
    }
  }
  return paths.join("");
}

export function summarizeResult(result: StencilResult): ProcessingStats {
  return {
    thresholdLabels: result.thresholds.map((value) => Math.round(value).toString()),
    totalBridges: result.layers.reduce((sum, layer) => sum + layer.bridges.length, 0),
    totalRemovedFragments: result.layers.reduce((sum, layer) => sum + layer.removedFragments, 0),
    warningCount: result.layers.reduce((sum, layer) => sum + layer.warnings.length, 0),
  };
}

export function countFloatingMaterialIslands(mask: Uint8Array, width: number, height: number): number {
  return analyzeMaterial(mask, width, height).islands.length;
}
