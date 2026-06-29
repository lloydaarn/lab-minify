import { emitKeypressEvents } from "node:readline";
import { DEFAULT_FORMATS, normalizeFormats } from "./scan.js";
import { normalizePreset, PRESETS } from "./optimize.js";

export async function promptForOptions(options, io) {
  if (!canPrompt(io)) {
    return options;
  }

  const preset = await selectOne(io, {
    label: "Preset",
    choices: orderChoices(Object.keys(PRESETS), normalizePreset(options.preset)).map((value) => ({
      value,
      label: PRESETS[value].label
    }))
  });
  const recursive = await selectOne(io, {
    label: "Recurse into subfolders",
    choices: booleanChoices(options.recursive !== false)
  });
  const formats = await selectMany(io, {
    label: "Formats",
    choices: formatChoices(options.formats ?? DEFAULT_FORMATS),
    selectedValues: normalizeFormats(options.formats ?? DEFAULT_FORMATS)
  });
  const replaceOnlyIfSmaller = await selectOne(io, {
    label: "Replace only if smaller",
    choices: booleanChoices(options.replaceOnlyIfSmaller !== false)
  });
  const backup = await selectOne(io, {
    label: "Create backup before optimize",
    choices: booleanChoices(options.backup !== false)
  });

  return {
    ...options,
    preset,
    recursive,
    formats,
    replaceOnlyIfSmaller,
    backup
  };
}

export async function promptToContinue(options, io) {
  if (!canPrompt(io)) {
    return true;
  }

  return selectOne(io, {
    label: "Continue after scan summary",
    choices: booleanChoices(true)
  });
}

export async function selectOne(io, prompt) {
  let activeIndex = 0;

  return runKeypressPrompt(io, {
    render() {
      return [
        prompt.label,
        "Use Up/Down to move. Press Space or Enter to choose.",
        ...prompt.choices.map((choice, index) => {
          const marker = index === activeIndex ? ">" : " ";
          const radio = index === activeIndex ? "(*)" : "( )";
          return `${marker} ${radio} ${choice.label}`;
        })
      ];
    },
    handleKey(key) {
      if (key.name === "up") {
        activeIndex = wrapIndex(activeIndex - 1, prompt.choices.length);
        return { done: false };
      }

      if (key.name === "down") {
        activeIndex = wrapIndex(activeIndex + 1, prompt.choices.length);
        return { done: false };
      }

      if (isChooseKey(key)) {
        const choice = prompt.choices[activeIndex];
        return {
          done: true,
          value: choice.value,
          summary: `${prompt.label}: ${choice.label}`
        };
      }

      return { done: false };
    }
  });
}

export async function selectMany(io, prompt) {
  let activeIndex = 0;
  const selectedValues = new Set(prompt.selectedValues);
  let warning = "";

  return runKeypressPrompt(io, {
    render() {
      return [
        prompt.label,
        "Use Up/Down to move. Press Space to toggle. Press Enter to confirm.",
        ...prompt.choices.map((choice, index) => {
          const marker = index === activeIndex ? ">" : " ";
          const checkbox = selectedValues.has(choice.value) ? "[x]" : "[ ]";
          return `${marker} ${checkbox} ${choice.label}`;
        }),
        warning
      ].filter(Boolean);
    },
    handleKey(key) {
      warning = "";

      if (key.name === "up") {
        activeIndex = wrapIndex(activeIndex - 1, prompt.choices.length);
        return { done: false };
      }

      if (key.name === "down") {
        activeIndex = wrapIndex(activeIndex + 1, prompt.choices.length);
        return { done: false };
      }

      if (key.name === "space") {
        const value = prompt.choices[activeIndex].value;

        if (selectedValues.has(value)) {
          if (selectedValues.size === 1) {
            warning = "Choose at least one format.";
            return { done: false };
          }

          selectedValues.delete(value);
        } else {
          selectedValues.add(value);
        }

        return { done: false };
      }

      if (key.name === "return" || key.name === "enter") {
        const values = prompt.choices
          .map((choice) => choice.value)
          .filter((value) => selectedValues.has(value));

        return {
          done: true,
          value: values,
          summary: `${prompt.label}: ${values.join(",")}`
        };
      }

      return { done: false };
    }
  });
}

export function canPrompt(io) {
  return io?.stdin?.isTTY === true && io?.stdout?.isTTY === true;
}

function runKeypressPrompt(io, prompt) {
  const input = io.stdin;
  const output = io.stdout;
  const wasPaused = typeof input.isPaused === "function" ? input.isPaused() : false;
  const previousRawMode = input.isRaw;
  let renderedLineCount = 0;

  emitKeypressEvents(input);
  input.setRawMode?.(true);
  input.resume?.();

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      input.off("keypress", handleKeypress);

      if (typeof previousRawMode === "boolean") {
        input.setRawMode?.(previousRawMode);
      } else {
        input.setRawMode?.(false);
      }

      if (wasPaused) {
        input.pause?.();
      }
    };

    const finish = (result) => {
      cleanup();
      clearRenderedPrompt(output, renderedLineCount);
      output.write(`${result.summary}\n`);
      resolve(result.value);
    };

    const render = () => {
      const lines = prompt.render();
      clearRenderedPrompt(output, renderedLineCount);
      output.write(`${lines.join("\n")}\n`);
      renderedLineCount = lines.length;
    };

    function handleKeypress(character, key = {}) {
      if (key.ctrl === true && key.name === "c") {
        cleanup();
        clearRenderedPrompt(output, renderedLineCount);
        output.write("\n");
        reject(new Error("Cancelled"));
        return;
      }

      const result = prompt.handleKey(normalizeKey(key, character));

      if (result.done) {
        finish(result);
        return;
      }

      render();
    }

    input.on("keypress", handleKeypress);
    render();
  });
}

function clearRenderedPrompt(output, lineCount) {
  if (lineCount <= 0) {
    return;
  }

  output.write(`\x1b[${lineCount}A`);
  output.write("\x1b[J");
}

function normalizeKey(key, character) {
  if (key.name) {
    return key;
  }

  if (character === " ") {
    return { name: "space" };
  }

  if (character === "\r" || character === "\n") {
    return { name: "return" };
  }

  return { name: "" };
}

function orderChoices(choices, defaultValue) {
  return [
    defaultValue,
    ...choices.filter((choice) => choice !== defaultValue)
  ];
}

function booleanChoices(defaultValue) {
  return orderChoices([true, false], defaultValue).map((value) => ({
    value,
    label: value ? "Yes" : "No"
  }));
}

function formatChoices(selectedFormats) {
  return normalizeFormats([
    ...normalizeFormats(selectedFormats),
    ...DEFAULT_FORMATS
  ]).map((format) => ({
    value: format,
    label: format
  }));
}

function isChooseKey(key) {
  return key.name === "space" || key.name === "return" || key.name === "enter";
}

function wrapIndex(index, length) {
  return (index + length) % length;
}
