import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { scanTarget } from "../src/scan.js";

test("scanTarget finds supported files recursively and skips unsupported files", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "lab-minify-scan-"));
  const imgDir = path.join(tempDir, "img");
  const nestedDir = path.join(imgDir, "nested");

  await mkdir(nestedDir, { recursive: true });
  await writeFile(path.join(imgDir, "photo.jpg"), "jpg");
  await writeFile(path.join(nestedDir, "graphic.png"), "png");
  await writeFile(path.join(imgDir, "vector.svg"), "svg");

  const scan = await scanTarget(imgDir);

  assert.equal(scan.filesScanned, 3);
  assert.deepEqual(scan.files.map((file) => file.relativePath), [
    path.join("nested", "graphic.png"),
    "photo.jpg"
  ]);
  assert.equal(scan.skipped.length, 1);
  assert.equal(scan.skipped[0].reason, "unsupported .svg");
});

test("scanTarget respects --no-recursive behavior", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "lab-minify-scan-"));
  const imgDir = path.join(tempDir, "img");
  const nestedDir = path.join(imgDir, "nested");

  await mkdir(nestedDir, { recursive: true });
  await writeFile(path.join(imgDir, "photo.jpg"), "jpg");
  await writeFile(path.join(nestedDir, "graphic.png"), "png");

  const scan = await scanTarget(imgDir, { recursive: false });

  assert.equal(scan.filesScanned, 1);
  assert.deepEqual(scan.files.map((file) => file.relativePath), ["photo.jpg"]);
});

test("scanTarget rejects missing and non-directory targets", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "lab-minify-scan-"));
  const filePath = path.join(tempDir, "photo.jpg");

  await writeFile(filePath, "jpg");

  await assert.rejects(
    () => scanTarget(path.join(tempDir, "missing")),
    /Target directory does not exist/
  );
  await assert.rejects(
    () => scanTarget(filePath),
    /Target must be a directory/
  );
});
