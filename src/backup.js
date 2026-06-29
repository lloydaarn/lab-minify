import path from "node:path";
import { access, copyFile, mkdir } from "node:fs/promises";

export async function resolveBackupRoot(targetDir, now = new Date()) {
  const parentDir = path.dirname(targetDir);
  const targetName = path.basename(targetDir);
  const basePath = path.join(parentDir, `${targetName}-minify-bak`);

  if (!(await pathExists(basePath))) {
    return basePath;
  }

  const timestamp = formatTimestamp(now);

  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? timestamp : `${timestamp}-${index}`;
    const candidate = `${basePath}-${suffix}`;

    if (!(await pathExists(candidate))) {
      return candidate;
    }
  }

  throw new Error(`Unable to find an available backup folder beside ${targetDir}`);
}

export async function backupFile(filePath, targetDir, backupRoot) {
  const relativePath = path.relative(targetDir, filePath);
  const destination = path.join(backupRoot, relativePath);

  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(filePath, destination);

  return destination;
}

export function formatTimestamp(date) {
  const pad = (value) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("") + "-" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

async function pathExists(filePath) {
  return access(filePath).then(
    () => true,
    () => false
  );
}
