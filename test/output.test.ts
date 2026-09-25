/**
 * The markup around entries.
 */
import { describe, expect, it } from "vitest";
import { Bibliography } from "../src/index.js";
import { SAMPLE_BIB } from "./fixtures.js";

describe("list and item markup", () => {
  it("adds a list class to csl-bib-body instead of writing class twice", () => {
    const bib = new Bibliography({ data: SAMPLE_BIB });
    const html = bib.formatHtml(bib.entries, { listAttributes: { class: "mine", reversed: true } });
    expect(html.split("\n")[0]).toBe('<ol reversed class="mine csl-bib-body">');
  });
});
