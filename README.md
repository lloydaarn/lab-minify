# lab-minify

`lab-minify` is a Node.js CLI for minifying image files in place with backups.

```bash
lab-minify ./img
```

It optimizes the original files, keeps the same image formats, and creates a backup folder before replacing files.

## Features

- Optimizes JPEG, PNG, WebP, and AVIF files.
- Keeps the same format; it does not generate WebP or AVIF copies.
- Creates backups beside the target directory before replacing files.
- Preserves nested folder structure inside the backup folder.
- Replaces originals only when the optimized output is smaller by default.
- Supports dry runs, recursive scans, and safe, balanced, and aggressive presets.
- Shows live progress in interactive terminals while files are processed.
- Skips SVG, GIF, ICO, XML, `.filepart`, and unknown file types.

## Requirements

- Node.js 20 or newer
- npm 10 or newer

## Install

Install globally if you want to run `lab-minify` from any project:

```bash
npm install -g lab-minify
```

Or run it without a global install:

```bash
npx lab-minify ./img
```

## Usage

```bash
lab-minify ./img
lab-minify ./img --dry-run
lab-minify ./img --yes
lab-minify ./img --preset safe
lab-minify ./img --preset balanced
lab-minify ./img --preset aggressive
lab-minify ./img --no-recursive
```

## Options

| Option | Description |
| --- | --- |
| `--dry-run` | Optimizes in memory and prints estimated savings without writing files. |
| `--yes`, `-y` | Skips prompts and uses defaults plus any flags you passed. |
| `--preset safe` | Uses lighter compression. |
| `--preset balanced` | Uses the default compression balance. |
| `--preset aggressive` | Uses stronger compression with a higher chance of visible quality loss. |
| `--no-recursive` | Only processes files directly inside the target folder. |
| `--formats jpg,png` | Limits optimization to selected formats. |
| `--no-backup` | Replaces files without creating backups. |
| `--replace-even-if-larger` | Replaces files even if the optimized result is larger. |

## Prompts

When `--yes` is not passed, `lab-minify` asks before making changes.

Use these keys:

- Up/Down: move between choices
- Space: choose or toggle
- Enter: confirm multi-select prompts
- Ctrl+C: cancel

Typed answers are ignored.

Default choices:

- Preset: `Balanced same-format`
- Recurse into subfolders: `Yes`
- Formats: `jpg,jpeg,png,webp,avif`
- Replace only if smaller: `Yes`
- Create backup before optimize: `Yes`
- Continue after scan summary: `Yes`

The final `Continue after scan summary` prompt lets you review the target folder, file counts, selected formats, preset, and dry-run status before processing starts.

## Dry Runs

Use `--dry-run` before modifying a folder:

```bash
lab-minify ./img --dry-run
```

Dry runs scan files, optimize in memory, and print estimated savings. They do not replace files, create temporary files, or create backup folders.

## Backup Behavior

For this command:

```bash
lab-minify ./img
```

The backup folder is created beside the target folder:

```text
img-minify-bak
```

If that folder already exists, `lab-minify` creates a timestamped folder:

```text
img-minify-bak-YYYYMMDD-HHMMSS
```

Only files that are actually replaced are backed up.

## Optimization Behavior

- JPEG files are normalized with Sharp and compressed with Sharp's mozjpeg-compatible encoder options.
- PNG files are normalized with Sharp and compressed with zlib plus palette quantization where the selected preset allows it.
- WebP and AVIF files are optimized with Sharp.
- Temporary files are written beside the original and then moved into place after successful optimization.
- Animated images are skipped to avoid dropping frames.
