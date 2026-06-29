import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { runCli } from "../src/cli.js";

test("runCli optimizes a JPEG in place and backs up the original", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "lab-minify-cli-"));
  const imgDir = path.join(tempDir, "img");
  const imagePath = path.join(imgDir, "photo.jpg");
  const width = 256;
  const height = 256;
  const channels = 3;

  await mkdir(imgDir);
  await sharp(randomBytes(width * height * channels), {
    raw: { width, height, channels }
  })
    .jpeg({ quality: 100 })
    .toFile(imagePath);

  const originalSize = (await stat(imagePath)).size;
  let stdout = "";
  let stderr = "";
  const exitCode = await runCli([imgDir, "--yes"], {
    cwd: tempDir,
    stdin: { isTTY: false },
    stdout: { write: (chunk) => { stdout += chunk; } },
    stderr: { write: (chunk) => { stderr += chunk; } }
  });

  const optimizedSize = (await stat(imagePath)).size;
  const backupPath = path.join(tempDir, "img-minify-bak", "photo.jpg");

  assert.equal(exitCode, 0, stderr);
  assert.ok(optimizedSize < originalSize);
  assert.equal((await stat(backupPath)).size, originalSize);
  assert.equal((await readFile(backupPath)).byteLength, originalSize);
  assert.match(stdout, /Files optimized: 1/);
  assert.match(stdout, /Backup folder path:/);
});
