import test from "node:test";
import assert from "node:assert/strict";
import {
  getPipelineForExtension,
  normalizePreset,
  shouldReplaceFile
} from "../src/optimize.js";

test("getPipelineForExtension follows the requested optimizer stack", () => {
  assert.deepEqual(getPipelineForExtension("jpg"), ["sharp", "sharp-mozjpeg-options"]);
  assert.deepEqual(getPipelineForExtension("jpeg"), ["sharp", "sharp-mozjpeg-options"]);
  assert.deepEqual(getPipelineForExtension("png"), ["sharp", "sharp-png-palette"]);
  assert.deepEqual(getPipelineForExtension("webp"), ["sharp"]);
  assert.deepEqual(getPipelineForExtension("avif"), ["sharp"]);
  assert.deepEqual(getPipelineForExtension("svg"), []);
});

test("shouldReplaceFile keeps larger optimized outputs by default", () => {
  assert.equal(shouldReplaceFile(100, 90, true), true);
  assert.equal(shouldReplaceFile(100, 100, true), false);
  assert.equal(shouldReplaceFile(100, 110, true), false);
  assert.equal(shouldReplaceFile(100, 110, false), true);
});

test("normalizePreset accepts supported presets only", () => {
  assert.equal(normalizePreset("SAFE"), "safe");
  assert.equal(normalizePreset("balanced"), "balanced");
  assert.equal(normalizePreset("aggressive"), "aggressive");
  assert.throws(() => normalizePreset("tiny"), /Unknown preset/);
});
