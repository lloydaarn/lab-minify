import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  createProgressLoader,
  parseArgs,
  renderReport,
  runCli
} from "../src/cli.js";
import { promptForOptions, selectMany, selectOne } from "../src/prompts.js";

test("parseArgs supports primary flags", () => {
  const options = parseArgs([
    "./img",
    "--yes",
    "--dry-run",
    "--preset",
    "aggressive",
    "--no-recursive",
    "--formats=jpg,png"
  ]);

  assert.equal(options.target, "./img");
  assert.equal(options.yes, true);
  assert.equal(options.dryRun, true);
  assert.equal(options.preset, "aggressive");
  assert.equal(options.recursive, false);
  assert.deepEqual(options.formats, ["jpg", "png"]);
});

test("parseArgs rejects unknown presets and options", () => {
  assert.throws(() => parseArgs(["./img", "--preset", "tiny"]), /Unknown preset/);
  assert.throws(() => parseArgs(["./img", "--wat"]), /Unknown option/);
});

test("renderReport includes required summary lines", () => {
  const report = renderReport({
    filesScanned: 3,
    optimized: 2,
    wouldOptimize: 0,
    skipped: 1,
    failed: 0,
    originalTotalSize: 1000,
    optimizedTotalSize: 700,
    savedBytes: 300,
    backupRoot: "img-minify-bak"
  });

  assert.match(report, /Files scanned: 3/);
  assert.match(report, /Files optimized: 2/);
  assert.match(report, /Files skipped: 1/);
  assert.match(report, /Total saved bytes: 300/);
  assert.match(report, /Backup folder path: img-minify-bak/);
});

test("runCli requires --yes when prompts cannot run", async () => {
  let stderr = "";
  const exitCode = await runCli(["./img"], {
    stdin: { isTTY: false },
    stdout: { isTTY: false, write: () => {} },
    stderr: { write: (chunk) => { stderr += chunk; } }
  });

  assert.equal(exitCode, 1);
  assert.match(stderr, /Interactive prompts require a TTY/);
});

test("createProgressLoader renders progress for TTY streams", () => {
  const chunks = [];
  const loader = createProgressLoader({
    stderr: {
      isTTY: true,
      columns: 80,
      write: (chunk) => { chunks.push(String(chunk)); }
    }
  }, {
    label: "Optimizing",
    total: 2
  });

  loader.start();
  loader.update(1, "nested/photo.jpg");
  loader.stop("Processed 1/2 files");

  const output = chunks.join("");
  assert.match(output, /Optimizing 1\/2 nested\/photo\.jpg/);
  assert.match(output, /Processed 1\/2 files/);
});

test("createProgressLoader does not render for non-TTY streams", () => {
  let output = "";
  const loader = createProgressLoader({
    stderr: {
      isTTY: false,
      write: (chunk) => { output += chunk; }
    }
  }, {
    label: "Optimizing",
    total: 2
  });

  loader.start();
  loader.update(1, "photo.jpg");
  loader.stop("Processed 1/2 files");

  assert.equal(output, "");
});

test("selectOne uses Space to choose the highlighted option", async () => {
  const { input, output } = createFakeTty();
  const selection = selectOne({ stdin: input, stdout: output }, {
    label: "Preset",
    choices: [
      { value: "balanced", label: "Balanced same-format" },
      { value: "safe", label: "Safe same-format" }
    ]
  });

  await pressKeys(input, [{ name: "down" }, { name: "space" }]);

  assert.equal(await selection, "safe");
  assert.match(output.text, /Press Space or Enter to choose/);
  assert.match(output.text, /Preset: Safe same-format/);
}
);

test("selectMany uses Space to toggle options and Enter to confirm", async () => {
  const { input, output } = createFakeTty();
  const selection = selectMany({ stdin: input, stdout: output }, {
    label: "Formats",
    choices: [
      { value: "jpg", label: "jpg" },
      { value: "png", label: "png" },
      { value: "webp", label: "webp" }
    ],
    selectedValues: ["jpg", "png"]
  });

  await pressKeys(input, [
    { name: "space" },
    { name: "down" },
    { name: "down" },
    { name: "space" },
    { name: "return" }
  ]);

  assert.deepEqual(await selection, ["png", "webp"]);
  assert.match(output.text, /Press Space to toggle/);
  assert.match(output.text, /Formats: png,webp/);
});

test("promptForOptions ignores typed letters and uses key choices", async () => {
  const { input, output } = createFakeTty();
  const options = promptForOptions({
    preset: "balanced",
    recursive: true,
    formats: ["jpg", "png"],
    replaceOnlyIfSmaller: true,
    backup: true
  }, {
    stdin: input,
    stdout: output
  });

  await pressKeys(input, [
    { name: "a", character: "a" },
    { name: "space" },
    { name: "space" },
    { name: "return" },
    { name: "space" },
    { name: "space" }
  ]);

  assert.deepEqual(await options, {
    preset: "balanced",
    recursive: true,
    formats: ["jpg", "png"],
    replaceOnlyIfSmaller: true,
    backup: true
  });
  assert.match(output.text, /Preset: Balanced same-format/);
  assert.doesNotMatch(output.text, /Using default/);
});

class FakeTtyInput extends EventEmitter {
  isTTY = true;
  isRaw = false;
  #paused = true;

  setRawMode(value) {
    this.isRaw = value;
  }

  resume() {
    this.#paused = false;
  }

  pause() {
    this.#paused = true;
  }

  isPaused() {
    return this.#paused;
  }
}

function createFakeTty() {
  const input = new FakeTtyInput();
  const output = {
    isTTY: true,
    text: "",
    write(chunk) {
      this.text += String(chunk);
    }
  };

  return { input, output };
}

async function pressKeys(input, keys) {
  for (const key of keys) {
    await new Promise((resolve) => setImmediate(resolve));
    input.emit("keypress", key.character ?? "", key);
  }
}
