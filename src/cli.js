import { scanTarget, DEFAULT_FORMATS, normalizeFormats } from "./scan.js";
import { backupFile, resolveBackupRoot } from "./backup.js";
import { normalizePreset, optimizeFile, PRESETS } from "./optimize.js";
import { canPrompt, promptForOptions, promptToContinue } from "./prompts.js";

const VERSION = "0.1.0";
const SPINNER_FRAMES = ["-", "\\", "|", "/"];

export async function runCli(argv, io = {}) {
  const runtime = {
    cwd: io.cwd ?? process.cwd(),
    stdin: io.stdin ?? process.stdin,
    stdout: io.stdout ?? process.stdout,
    stderr: io.stderr ?? process.stderr
  };

  try {
    return await executeCli(argv, runtime);
  } catch (error) {
    runtime.stderr.write(`Error: ${error.message}\n`);
    return 1;
  }
}

export function parseArgs(argv) {
  const options = {
    target: null,
    yes: false,
    dryRun: false,
    preset: "balanced",
    recursive: true,
    formats: DEFAULT_FORMATS,
    replaceOnlyIfSmaller: true,
    backup: true,
    help: false,
    version: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--version" || arg === "-v") {
      options.version = true;
      continue;
    }

    if (arg === "--yes" || arg === "-y") {
      options.yes = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--no-recursive") {
      options.recursive = false;
      continue;
    }

    if (arg === "--recursive") {
      options.recursive = true;
      continue;
    }

    if (arg === "--no-backup") {
      options.backup = false;
      continue;
    }

    if (arg === "--replace-even-if-larger") {
      options.replaceOnlyIfSmaller = false;
      continue;
    }

    if (arg === "--preset") {
      options.preset = readValue(argv, index, "--preset");
      index += 1;
      continue;
    }

    if (arg.startsWith("--preset=")) {
      options.preset = arg.slice("--preset=".length);
      continue;
    }

    if (arg === "--formats") {
      options.formats = normalizeFormats(readValue(argv, index, "--formats"));
      index += 1;
      continue;
    }

    if (arg.startsWith("--formats=")) {
      options.formats = normalizeFormats(arg.slice("--formats=".length));
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (options.target) {
      throw new Error(`Unexpected extra argument: ${arg}`);
    }

    options.target = arg;
  }

  options.preset = normalizePreset(options.preset);
  options.formats = normalizeFormats(options.formats);

  return options;
}

async function executeCli(argv, io) {
  let options = parseArgs(argv);

  if (options.help) {
    io.stdout.write(getHelpText());
    return 0;
  }

  if (options.version) {
    io.stdout.write(`${VERSION}\n`);
    return 0;
  }

  if (!options.target) {
    throw new Error("Missing target directory. Example: npx lab-minify ./img");
  }

  if (!options.yes) {
    if (!canPrompt(io)) {
      throw new Error("Interactive prompts require a TTY. Re-run with --yes to use defaults non-interactively.");
    }

    options = await promptForOptions(options, io);
  }

  const scan = await scanTarget(options.target, {
    cwd: io.cwd,
    recursive: options.recursive,
    formats: options.formats
  });

  writeScanSummary(scan, options, io);

  if (!options.yes) {
    const shouldContinue = await promptToContinue(options, io);

    if (!shouldContinue) {
      io.stdout.write("Cancelled.\n");
      return 0;
    }
  }

  const report = await optimizeFiles(scan, options, io);
  io.stdout.write(renderReport(report));

  return report.failed > 0 ? 1 : 0;
}

async function optimizeFiles(scan, options, io) {
  const report = {
    filesScanned: scan.filesScanned,
    optimized: 0,
    wouldOptimize: 0,
    skipped: scan.skipped.length,
    failed: 0,
    originalTotalSize: 0,
    optimizedTotalSize: 0,
    savedBytes: 0,
    backupRoot: null
  };

  let backupRoot = null;
  let processedFiles = 0;
  const loader = createProgressLoader(io, {
    label: options.dryRun ? "Checking" : "Optimizing",
    total: scan.files.length
  });

  const getBackupRoot = async () => {
    if (!backupRoot) {
      backupRoot = await resolveBackupRoot(scan.targetDir);
      report.backupRoot = backupRoot;
    }

    return backupRoot;
  };

  loader.start();

  try {
    for (const file of scan.files) {
      processedFiles += 1;
      loader.update(processedFiles, file.relativePath);

      try {
        const result = await optimizeFile(file, {
          preset: options.preset,
          dryRun: options.dryRun,
          replaceOnlyIfSmaller: options.replaceOnlyIfSmaller,
          onBeforeReplace: options.backup === false
            ? null
            : async () => backupFile(file.absolutePath, scan.targetDir, await getBackupRoot())
        });

        report.originalTotalSize += result.originalSize;
        report.optimizedTotalSize += result.optimizedSize;
        report.savedBytes += result.savedBytes;

        if (result.status === "optimized") {
          report.optimized += 1;
        } else if (result.status === "wouldOptimize") {
          report.wouldOptimize += 1;
        } else {
          report.skipped += 1;
        }
      } catch (error) {
        loader.clear();
        report.failed += 1;
        io.stderr.write(`${file.relativePath}: ${error.message}\n`);
      }
    }
  } finally {
    loader.stop(`Processed ${processedFiles}/${scan.files.length} files`);
  }

  if (options.dryRun) {
    report.backupRoot = null;
  }

  return report;
}

export function createProgressLoader(io, options) {
  const stream = io.stderr;
  const total = options.total;
  const enabled = stream?.isTTY === true && typeof stream.write === "function" && total > 0;
  let active = false;
  let frameIndex = 0;
  let timer = null;
  let processed = 0;
  let currentFile = "";

  const render = () => {
    if (!enabled || !active) {
      return;
    }

    clearProgressLine(stream);
    stream.write([
      SPINNER_FRAMES[frameIndex],
      ` ${options.label} ${processed}/${total}`,
      currentFile ? ` ${truncateMiddle(currentFile, getFileLabelLimit(stream))}` : ""
    ].join(""));
    frameIndex = (frameIndex + 1) % SPINNER_FRAMES.length;
  };

  return {
    start() {
      if (!enabled) {
        return;
      }

      active = true;
      render();
      timer = setInterval(render, 120);
      timer.unref?.();
    },
    update(nextProcessed, filePath) {
      processed = nextProcessed;
      currentFile = filePath ?? "";
      render();
    },
    clear() {
      if (!enabled || !active) {
        return;
      }

      clearProgressLine(stream);
    },
    stop(summary) {
      if (!enabled || !active) {
        return;
      }

      active = false;
      if (timer) {
        clearInterval(timer);
      }
      clearProgressLine(stream);
      stream.write(`${summary}\n`);
    }
  };
}

function clearProgressLine(stream) {
  if (typeof stream.clearLine === "function") {
    stream.clearLine(0);
  } else {
    stream.write("\x1b[2K");
  }

  if (typeof stream.cursorTo === "function") {
    stream.cursorTo(0);
  } else {
    stream.write("\r");
  }
}

function writeScanSummary(scan, options, io) {
  const preset = PRESETS[options.preset];

  io.stdout.write([
    "Scan summary",
    `Target: ${scan.targetDir}`,
    `Files scanned: ${scan.filesScanned}`,
    `Optimizable files: ${scan.files.length}`,
    `Skipped before optimize: ${scan.skipped.length}`,
    `Preset: ${preset.label}`,
    `Recursive: ${options.recursive ? "yes" : "no"}`,
    `Formats: ${options.formats.join(",")}`,
    `Dry run: ${options.dryRun ? "yes" : "no"}`,
    ""
  ].join("\n"));
}

export function renderReport(report) {
  const optimizedLabel = report.wouldOptimize > 0
    ? `${report.optimized} (${report.wouldOptimize} would optimize in dry run)`
    : `${report.optimized}`;
  const savedPercent = report.originalTotalSize === 0
    ? 0
    : (report.savedBytes / report.originalTotalSize) * 100;

  return [
    "",
    "Minify report",
    `Files scanned: ${report.filesScanned}`,
    `Files optimized: ${optimizedLabel}`,
    `Files skipped: ${report.skipped}`,
    `Files failed: ${report.failed}`,
    `Original total size: ${formatBytes(report.originalTotalSize)}`,
    `Optimized total size: ${formatBytes(report.optimizedTotalSize)}`,
    `Total saved bytes: ${report.savedBytes}`,
    `Saved percentage: ${savedPercent.toFixed(2)}%`,
    `Backup folder path: ${report.backupRoot ?? "none"}`,
    ""
  ].join("\n");
}

function getHelpText() {
  return `lab-minify ${VERSION}

Usage:
  lab-minify <directory> [options]

Options:
  -y, --yes                    Run without prompts using defaults or flags
      --dry-run                Scan and optimize in memory without writing files
      --preset <name>          safe, balanced, or aggressive
      --no-recursive           Do not recurse into subfolders
      --formats <list>         Comma-separated formats, default jpg,jpeg,png,webp,avif
      --no-backup              Replace files without writing backups
      --replace-even-if-larger Replace even when optimized output is larger
  -h, --help                   Show help
  -v, --version                Show version
`;
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  if (unitIndex === 0) {
    return `${value} ${units[unitIndex]}`;
  }

  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

function getFileLabelLimit(stream) {
  if (!Number.isInteger(stream.columns) || stream.columns < 60) {
    return 48;
  }

  return Math.max(24, stream.columns - 32);
}

function truncateMiddle(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  const ellipsis = "...";
  const visibleLength = maxLength - ellipsis.length;
  const startLength = Math.ceil(visibleLength / 2);
  const endLength = Math.floor(visibleLength / 2);

  return `${value.slice(0, startLength)}${ellipsis}${value.slice(value.length - endLength)}`;
}

function readValue(argv, index, optionName) {
  const value = argv[index + 1];

  if (!value || value.startsWith("-")) {
    throw new Error(`Missing value for ${optionName}`);
  }

  return value;
}
