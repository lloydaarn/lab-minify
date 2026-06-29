import path from "node:path";
import { readdir, stat } from "node:fs/promises";

export const DEFAULT_FORMATS = Object.freeze(["jpg", "jpeg", "png", "webp", "avif"]);

const DEFAULT_SKIP_EXTENSIONS = new Set([
  "svg",
  "gif",
  "ico",
  "xml",
  "filepart"
]);

export function normalizeFormats(formats = DEFAULT_FORMATS) {
  const values = Array.isArray(formats) ? formats : [formats];
  const normalized = values
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim().toLowerCase().replace(/^\./, ""))
    .filter(Boolean);

  return [...new Set(normalized)];
}

export function getExtension(filePath) {
  return path.extname(filePath).slice(1).toLowerCase();
}

export function isSupportedExtension(extension, formats = DEFAULT_FORMATS) {
  const normalizedExtension = String(extension).toLowerCase().replace(/^\./, "");
  return normalizeFormats(formats).includes(normalizedExtension);
}

export async function scanTarget(targetPath, options = {}) {
  const recursive = options.recursive !== false;
  const formats = normalizeFormats(options.formats);
  const absoluteTarget = path.resolve(options.cwd ?? process.cwd(), targetPath);
  const targetStats = await stat(absoluteTarget).catch((error) => {
    if (error.code === "ENOENT") {
      throw new Error(`Target directory does not exist: ${targetPath}`);
    }

    throw error;
  });

  if (!targetStats.isDirectory()) {
    throw new Error(`Target must be a directory: ${targetPath}`);
  }

  const result = {
    targetDir: absoluteTarget,
    files: [],
    skipped: [],
    filesScanned: 0
  };

  await walkDirectory(absoluteTarget, {
    targetDir: absoluteTarget,
    recursive,
    formats,
    result
  });

  result.files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  result.skipped.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  return result;
}

async function walkDirectory(directory, context) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (context.recursive) {
        await walkDirectory(absolutePath, context);
      }

      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    context.result.filesScanned += 1;

    const extension = getExtension(entry.name);
    const relativePath = path.relative(context.targetDir, absolutePath);

    if (isSupportedExtension(extension, context.formats)) {
      context.result.files.push({
        absolutePath,
        relativePath,
        extension
      });
      continue;
    }

    context.result.skipped.push({
      absolutePath,
      relativePath,
      extension,
      reason: getSkipReason(extension)
    });
  }
}

function getSkipReason(extension) {
  if (!extension) {
    return "unknown extension";
  }

  if (DEFAULT_SKIP_EXTENSIONS.has(extension)) {
    return `unsupported .${extension}`;
  }

  return `format not selected or unsupported .${extension}`;
}
