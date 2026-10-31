import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Colors from docs/constelaciones-diseno.md, section 1.1.
const tokens: Record<string, string> = {
  "--sky": "#050813",
  "--sky-2": "#0b1326",
  "--panel": "rgba(10, 15, 30, 0.8)",
  "--panel-solid": "#0b1122",
  "--line": "rgba(190, 202, 230, 0.14)",
  "--ink": "#eceff6",
  "--ink-2": "#a3adc4",
  "--ink-3": "#6d7892",
  "--gold": "#e8cb8f",
  "--blue": "#9dc3ff",
};

describe("design tokens", () => {
  const css = readFileSync(new URL("../../src/app/globals.css", import.meta.url), "utf8");

  it.each(Object.entries(tokens))("defines %s as %s", (name, value) => {
    expect(css).toContain(`${name}: ${value};`);
  });
});
