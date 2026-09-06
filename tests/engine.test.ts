import test from "node:test";
import assert from "node:assert/strict";
import { autoBridgeMaterial, calculatePortraitThresholds, calculateToneThresholds, countFloatingMaterialIslands, maskToSvgPath, processStencil } from "../src/engine";
import { createCombinedSvg, createLayerSvg } from "../src/renderer";
import type { LayerCount, StencilSettings } from "../src/types";

function settings(layerCount: LayerCount = 3): StencilSettings {
  return {
    layerCount,
    profile: "portrait",
    contrast: 115,
    detail: 54,
    edgeStrength: 70,
    shadowBias: 55,
    minDetailMm: 1,
    bridgeWidthMm: 3,
    backgroundTolerance: 20,
    backgroundSample: null,
    backgroundSeed: null,
    backgroundRegions: [],
    backgroundColor: "#f4f0e6",
    palette: ["#111111", "#555555", "#888888", "#bbbbbb", "#dddddd"],
    page: { widthMm: 210, heightMm: 297 },
    marginMm: 14,
  };
}

function gradientImage(width: number, height: number, transparentCorner = false): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const value = Math.round(x / Math.max(1, width - 1) * 255);
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = transparentCorner && x < 3 && y < 3 ? 0 : 255;
    }
  }
  return { width, height, data, colorSpace: "srgb" } as ImageData;
}

test("tone thresholds are sorted and deterministic", () => {
  const values = Uint8Array.from({ length: 256 }, (_, index) => index);
  const first = calculateToneThresholds(values, 5);
  const second = calculateToneThresholds(values, 5);
  assert.deepEqual(first, second);
  assert.equal(first.length, 4);
  assert.ok(first.every((value, index) => index === 0 || value > (first[index - 1] ?? -1)));
});

test("3, 4 and 5 portrait layers nest from the light base to dark details", () => {
  for (const count of [3, 4, 5] as const) {
    const source = gradientImage(72, 48);
    const result = processStencil(source, settings(count));
    assert.equal(result.layers.length, count);
    assert.equal(result.thresholds.length, count - 1);
    for (let pixel = 0; pixel < source.width * source.height; pixel += 1) {
      for (let layer = 1; layer < result.layers.length; layer += 1) {
        if (result.layers[layer]!.mask[pixel]) assert.equal(result.layers[layer - 1]!.mask[pixel], 1);
      }
    }
  }
});

test("portrait thresholds are deterministic and respond to shadow depth", () => {
  const values = Uint8Array.from({ length: 256 }, (_, index) => index);
  const neutral = calculatePortraitThresholds(values, 5, 50);
  assert.deepEqual(neutral, calculatePortraitThresholds(values, 5, 50));
  const deeper = calculatePortraitThresholds(values, 5, 80);
  assert.ok(deeper.every((value, index) => value >= (neutral[index] ?? value)));
});

test("transparent areas are treated as background", () => {
  const result = processStencil(gradientImage(24, 20, true), settings());
  assert.equal(result.backgroundMask[0], 1);
  assert.equal(result.backgroundMask[2 * result.width + 2], 1);
  assert.equal(result.backgroundMask[4 * result.width + 4], 0);
});

test("automatic bridging connects a floating material island to the sheet", () => {
  const width = 31;
  const height = 31;
  const mask = new Uint8Array(width * height);
  for (let y = 5; y < 26; y += 1) {
    for (let x = 5; x < 26; x += 1) mask[y * width + x] = 1;
  }
  for (let y = 12; y < 19; y += 1) {
    for (let x = 12; x < 19; x += 1) mask[y * width + x] = 0;
  }
  assert.equal(countFloatingMaterialIslands(mask, width, height), 1);
  const bridged = autoBridgeMaterial(mask, width, height, 3);
  assert.equal(bridged.bridges.length, 1);
  assert.equal(bridged.floatingIslands, 0);
  assert.equal(countFloatingMaterialIslands(mask, width, height), 0);
});

test("vector tracing creates closed SVG paths", () => {
  const mask = new Uint8Array(8 * 8);
  for (let y = 2; y < 6; y += 1) for (let x = 1; x < 7; x += 1) mask[y * 8 + x] = 1;
  const path = maskToSvgPath(mask, 8, 8);
  assert.match(path, /^M/);
  assert.match(path, /Z$/);
  assert.ok(path.includes("L"));
});

test("SVG export has millimetre dimensions, named layers and three matching registration marks", () => {
  const config = settings(3);
  const result = processStencil(gradientImage(48, 64), config);
  const layerSvg = createLayerSvg(result, config, 0);
  const combinedSvg = createCombinedSvg(result, config);
  assert.match(layerSvg, /width="210mm" height="297mm"/);
  assert.match(layerSvg, /id="layer-1-cut"/);
  assert.equal((layerSvg.match(/<circle/g) ?? []).length, 3);
  assert.match(combinedSvg, /id="layer-1"/);
  assert.match(combinedSvg, /id="layer-2"/);
  assert.match(combinedSvg, /id="layer-3"/);
  assert.equal((combinedSvg.match(/<circle/g) ?? []).length, 3);
});
