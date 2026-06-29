import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { backupFile, formatTimestamp, resolveBackupRoot } from "../src/backup.js";

test("backupFile preserves nested paths", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "lab-minify-backup-"));
  const imgDir = path.join(tempDir, "img");
  const nestedDir = path.join(imgDir, "nested");
  const backupRoot = path.join(tempDir, "img-minify-bak");
  const filePath = path.join(nestedDir, "photo.jpg");

  await mkdir(nestedDir, { recursive: true });
  await writeFile(filePath, "original");

  const backupPath = await backupFile(filePath, imgDir, backupRoot);

  assert.equal(backupPath, path.join(backupRoot, "nested", "photo.jpg"));
  assert.equal(await readFile(backupPath, "utf8"), "original");
});

test("resolveBackupRoot uses timestamp when base backup exists", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "lab-minify-backup-"));
  const imgDir = path.join(tempDir, "img");
  const existingBackup = path.join(tempDir, "img-minify-bak");
  const now = new Date(2026, 5, 29, 10, 5, 7);

  await mkdir(imgDir, { recursive: true });
  await mkdir(existingBackup);

  assert.equal(
    await resolveBackupRoot(imgDir, now),
    path.join(tempDir, `img-minify-bak-${formatTimestamp(now)}`)
  );
});
