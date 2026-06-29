import path from "node:path";
import { readFile, rename, rm, writeFile } from "node:fs/promises";

export const PRESETS = Object.freeze({
  safe: Object.freeze({
    label: "Safe same-format",
    jpegQuality: 88,
    pngPalette: false,
    pngQuality: 100,
    pngEffort: 7,
    webpQuality: 86,
    avifQuality: 52,
    effort: 4
  }),
  balanced: Object.freeze({
    label: "Balanced same-format",
    jpegQuality: 82,
    pngPalette: true,
    pngQuality: 92,
    pngEffort: 8,
    webpQuality: 82,
    avifQuality: 45,
    effort: 5
  }),
  aggressive: Object.freeze({
    label: "Aggressive same-format",
    jpegQuality: 72,
    pngPalette: true,
    pngQuality: 75,
    pngEffort: 10,
    webpQuality: 72,
    avifQuality: 38,
    effort: 6
  })
});

export function normalizePreset(preset = "balanced") {
  const normalized = String(preset).trim().toLowerCase();

  if (!PRESETS[normalized]) {
    throw new Error(`Unknown preset "${preset}". Use safe, balanced, or aggressive.`);
  }

  return normalized;
}

export function getPipelineForExtension(extension) {
  const normalized = String(extension).toLowerCase().replace(/^\./, "");

  if (normalized === "jpg" || normalized === "jpeg") {
    return ["sharp", "sharp-mozjpeg-options"];
  }

  if (normalized === "png") {
    return ["sharp", "sharp-png-palette"];
  }

  if (normalized === "webp" || normalized === "avif") {
    return ["sharp"];
  }

  return [];
}

export function shouldReplaceFile(originalSize, optimizedSize, replaceOnlyIfSmaller = true) {
  if (!replaceOnlyIfSmaller) {
    return true;
  }

  return optimizedSize < originalSize;
}

export async function optimizeFile(file, options = {}) {
  const presetName = normalizePreset(options.preset);
  const preset = PRESETS[presetName];
  const originalBuffer = await readFile(file.absolutePath);
  const originalSize = originalBuffer.byteLength;
  const optimized = await optimizeBuffer(file.extension, originalBuffer, preset);

  if (optimized.skipped) {
    return {
      status: "skipped",
      reason: optimized.reason,
      originalSize,
      optimizedSize: originalSize,
      savedBytes: 0
    };
  }

  const optimizedSize = optimized.buffer.byteLength;
  const shouldReplace = shouldReplaceFile(
    originalSize,
    optimizedSize,
    options.replaceOnlyIfSmaller !== false
  );

  if (!shouldReplace) {
    return {
      status: "skipped",
      reason: "optimized output was not smaller",
      originalSize,
      optimizedSize: originalSize,
      candidateSize: optimizedSize,
      savedBytes: 0
    };
  }

  if (options.dryRun) {
    return {
      status: "wouldOptimize",
      originalSize,
      optimizedSize,
      savedBytes: originalSize - optimizedSize
    };
  }

  const tempPath = await writeTempFile(file.absolutePath, optimized.buffer);

  try {
    if (options.onBeforeReplace) {
      await options.onBeforeReplace(file);
    }

    await rename(tempPath, file.absolutePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }

  return {
    status: "optimized",
    originalSize,
    optimizedSize,
    savedBytes: originalSize - optimizedSize
  };
}

export async function optimizeBuffer(extension, inputBuffer, preset) {
  const normalized = String(extension).toLowerCase().replace(/^\./, "");
  const pipeline = getPipelineForExtension(normalized);

  if (pipeline.length === 0) {
    return {
      skipped: true,
      reason: `unsupported .${normalized || "unknown"}`
    };
  }

  const sharp = await loadDefaultExport("sharp");
  const metadata = await sharp(inputBuffer, { animated: true }).metadata();

  if (metadata.pages && metadata.pages > 1) {
    return {
      skipped: true,
      reason: "animated images are not supported"
    };
  }

  if (normalized === "jpg" || normalized === "jpeg") {
    return {
      buffer: await sharp(inputBuffer)
        .rotate()
        .jpeg({
          quality: preset.jpegQuality,
          chromaSubsampling: "4:2:0",
          mozjpeg: true
        })
        .toBuffer()
    };
  }

  if (normalized === "png") {
    const pngOptions = {
      compressionLevel: 9,
      adaptiveFiltering: true,
      palette: preset.pngPalette
    };

    if (preset.pngPalette) {
      pngOptions.quality = preset.pngQuality;
      pngOptions.effort = preset.pngEffort;
    }

    return {
      buffer: await sharp(inputBuffer)
        .rotate()
        .png(pngOptions)
        .toBuffer()
    };
  }

  if (normalized === "webp") {
    return {
      buffer: await sharp(inputBuffer)
      .rotate()
        .webp({ quality: preset.webpQuality, effort: preset.effort })
        .toBuffer()
    };
  }

  return {
    buffer: await sharp(inputBuffer)
      .rotate()
      .avif({ quality: preset.avifQuality, effort: preset.effort })
      .toBuffer()
  };
}

async function writeTempFile(filePath, buffer) {
  const directory = path.dirname(filePath);
  const name = path.basename(filePath);

  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? "" : `-${index}`;
    const tempPath = path.join(
      directory,
      `.${name}.lab-minify-${process.pid}-${Date.now()}${suffix}.tmp`
    );

    try {
      await writeFile(tempPath, buffer, { flag: "wx" });
      return tempPath;
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }
    }
  }

  throw new Error(`Unable to create temporary output beside ${filePath}`);
}

async function loadDefaultExport(packageName) {
  const imported = await import(packageName);
  return imported.default ?? imported;
}
