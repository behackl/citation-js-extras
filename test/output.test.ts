/**
 * The markup around entries, sanitizing, locale, and that `formatEntry` and
 * `formatHtml` agree.
 */
import { describe, expect, it } from "vitest";
import { Bibliography, badgePresets } from "../src/index.js";
import { SAMPLE_BIB } from "./fixtures.js";

const MATH_BIB = String.raw`
@article{math:2024, author = {Doe, Jane}, title = {Random $k$-ary trees}, journal = {J}, year = {2024}, doi = {10.1000/m}}
@article{plain:2023, author = {Roe, Richard}, title = {No mathematics here}, journal = {J}, year = {2023}}
`;

const renderMath = (tex: string) => `<b class="math">${tex}</b>`;

describe("list and item markup", () => {
  it("adds a list class to csl-bib-body instead of writing class twice", () => {
    const bib = new Bibliography({ data: SAMPLE_BIB });
    const html = bib.formatHtml(bib.entries, { listAttributes: { class: "mine", reversed: true } });
    expect(html.split("\n")[0]).toBe('<ol reversed class="mine csl-bib-body">');
  });

  it("adds item attributes, merging the class", () => {
    const bib = new Bibliography({ data: SAMPLE_BIB, customFields: ["publication-status"] });
    const html = bib.formatHtml(bib.entries, {
      itemAttributes: entry => ({ id: `pub-${entry.key}`, class: entry.custom["publication-status"] ?? "" }),
    });
    expect(html).toContain('<li data-csl-entry-id="doe:2024:gadgets" id="pub-doe:2024:gadgets" class="published csl-entry">');
  });

  it("names the badge wrapper as configured", () => {
    const bib = new Bibliography({ data: SAMPLE_BIB, badges: [badgePresets.doi] });
    expect(bib.formatHtml(bib.entries)).toContain('<span class="bib-links">');
    expect(bib.formatHtml(bib.entries, { badgeListClassName: "links" })).toContain('<span class="links">');
  });
});

describe("sanitize", () => {
  it("sees formulas as placeholders; rendered math is inserted afterwards", () => {
    const bib = new Bibliography({ data: MATH_BIB, preserveMath: true });
    const seen: string[] = [];
    const html = bib.formatHtml(bib.entries, {
      renderMath,
      sanitize: (input) => {
        seen.push(input);
        // A strict sanitizer: drops every attribute.
        return input.replace(/<(\/?\w+)[^>]*>/g, "<$1>");
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toContain('class="math"');
    expect(seen[0]).toMatch(/placeholder\d+end/i);
    expect(html).toContain('<b class="math">k</b>');
    expect(html).not.toContain("csl-entry");
  });

  it("works without mathematics", () => {
    const bib = new Bibliography({ data: SAMPLE_BIB });
    expect(bib.formatHtml(bib.entries, { sanitize: html => html.toUpperCase() })).toContain("CSL-BIB-BODY");
  });
});

describe("locale", () => {
  const data = "@incollection{c, author={Doe, Jane}, title={Kapitel}, booktitle={Buch}, editor={Roe, Richard}, pages={1--9}, year={2020}, publisher={X}}";

  it("defaults to en-US", () => {
    const bib = new Bibliography({ data, cslStyle: "apa" });
    expect(bib.formatEntry(bib.entries[0]!)).toContain("(Ed.)");
  });

  it("uses the configured locale", () => {
    const bib = new Bibliography({ data, cslStyle: "apa" });
    const html = bib.formatEntry(bib.entries[0]!, { lang: "de-DE" });
    expect(html).toContain("(Hrsg.)");
    expect(html).toContain("S. 1–9");
  });
});

describe("formatEntry and formatHtml agree", () => {
  for (const cslStyle of ["apa"]) {
    it(`for every sample entry (${cslStyle})`, () => {
      const bib = new Bibliography({
        data: SAMPLE_BIB,
        cslStyle,
        badges: Object.values(badgePresets),
        preserveMath: true,
      });
      for (const entry of bib.entries) {
        const item = bib.formatHtml([entry]).match(/<li[^>]*>([\s\S]*)<\/li>/)![1];
        expect(item, entry.key).toBe(bib.formatEntry(entry));
      }
    });
  }
});
