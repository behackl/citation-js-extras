import { describe, expect, it } from "vitest";
import { Bibliography } from "../src/index.js";
import type { BadgeConfig } from "../src/types.js";
import { SAMPLE_BIB } from "./fixtures.js";

const BADGES: BadgeConfig[] = [
  { field: "doi", label: "doi", url: "https://doi.org/$1", className: "badge" },
];

const MATH_BIB = `
@Article{math:2024,
  author = {Doe, Jane},
  title  = {Random $k$-ary trees},
  year   = {2024},
}

@Article{plain:2023,
  author = {Roe, Richard},
  title  = {No mathematics here},
  year   = {2023},
}
`;

describe("formatting defaults from the constructor", () => {
  it("applies badges given at construction time", () => {
    const bib = new Bibliography({ data: SAMPLE_BIB, customFields: ["doi"], badges: BADGES });
    expect(bib.formatHtml(bib.entries)).toContain("https://doi.org/10.1234/jws.2023.001");
    expect(bib.formatEntry(bib.entries[0]!)).toContain('class="badge"');
  });

  it("lets a call override the defaults", () => {
    const bib = new Bibliography({ data: SAMPLE_BIB, customFields: ["doi"], badges: BADGES });
    expect(bib.formatHtml(bib.entries, { badges: [] })).not.toContain('class="badge"');
  });

  it("keeps working when no defaults are given", () => {
    const bib = new Bibliography({ data: SAMPLE_BIB, customFields: ["doi"] });
    expect(bib.formatHtml(bib.entries)).not.toContain('class="badge"');
    expect(bib.formatHtml(bib.entries, { badges: BADGES })).toContain('class="badge"');
  });

  it("honours titleLink and linkifyUrls defaults", () => {
    const linked = new Bibliography({ data: SAMPLE_BIB, customFields: ["doi"], titleLink: ["doi"] });
    expect(linked.formatEntry(linked.entries[0]!)).toContain("https://doi.org/");

    const plain = new Bibliography({ data: SAMPLE_BIB, linkifyUrls: false });
    const html = plain.formatHtml(plain.entries);
    expect(html).not.toContain('<a href="https://example.com/widgets">https://');
  });
});

describe("formatEntry honours linkifyUrls like formatHtml", () => {
  const bareUrl = (html: string) => /<a href="(https?:[^"]+)">\1<\/a>/.test(html);

  it("linkifies bare URLs by default", () => {
    const bib = new Bibliography({ data: SAMPLE_BIB, customFields: ["doi"] });
    const entry = bib.entries[0]!;
    expect(bareUrl(bib.formatEntry(entry))).toBe(true);
    expect(bareUrl(bib.formatHtml([entry]))).toBe(true);
  });

  it("respects a constructor default of false", () => {
    const bib = new Bibliography({ data: SAMPLE_BIB, customFields: ["doi"], linkifyUrls: false });
    expect(bareUrl(bib.formatEntry(bib.entries[0]!))).toBe(false);
  });

  it("lets a call override a true default", () => {
    const bib = new Bibliography({ data: SAMPLE_BIB, customFields: ["doi"], linkifyUrls: true });
    expect(bareUrl(bib.formatEntry(bib.entries[0]!, { linkifyUrls: false }))).toBe(false);
  });

  it("lets a call override a false default", () => {
    const bib = new Bibliography({ data: SAMPLE_BIB, customFields: ["doi"], linkifyUrls: false });
    expect(bareUrl(bib.formatEntry(bib.entries[0]!, { linkifyUrls: true }))).toBe(true);
  });
});

describe("math error attribution", () => {
  const failing = () => {
    throw new Error("Undefined control sequence");
  };

  it("names the entry whose formula could not be rendered", () => {
    const bib = new Bibliography({ data: MATH_BIB, preserveMath: true });
    expect(() => bib.formatHtml(bib.entries, { renderMath: failing }))
      .toThrow(/entry math:2024: Undefined control sequence/);
  });

  it("names the entry for formatEntry as well", () => {
    const bib = new Bibliography({ data: MATH_BIB, preserveMath: true });
    const entry = bib.entries.find(item => item.key === "math:2024")!;
    expect(() => bib.formatEntry(entry, { renderMath: failing })).toThrow(/entry math:2024/);
  });

  it("keeps the original error as the cause", () => {
    const bib = new Bibliography({ data: MATH_BIB, preserveMath: true });
    try {
      bib.formatHtml(bib.entries, { renderMath: failing });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).cause).toBeInstanceOf(Error);
    }
  });
});

describe("rendered math and URL linkification", () => {
  it("does not linkify the MathML namespace URL", () => {
    const bib = new Bibliography({ data: MATH_BIB, preserveMath: true });
    const html = bib.formatHtml(bib.entries, {
      // Stand-in for KaTeX/MathJax output, which carries an xmlns URL.
      renderMath: tex => `<math xmlns="http://www.w3.org/1998/Math/MathML">${tex}</math>`,
    });
    expect(html).toContain('xmlns="http://www.w3.org/1998/Math/MathML"');
    expect(html).not.toContain('<a href="http://www.w3.org/1998/Math/MathML"');
  });

  it("does not linkify the MathML namespace URL in formatEntry either", () => {
    const bib = new Bibliography({ data: MATH_BIB, preserveMath: true });
    const entry = bib.entries.find(item => item.key === "math:2024")!;
    const html = bib.formatEntry(entry, {
      renderMath: tex => `<math xmlns="http://www.w3.org/1998/Math/MathML">${tex}</math>`,
    });
    expect(html).toContain('xmlns="http://www.w3.org/1998/Math/MathML"');
    expect(html).not.toContain('<a href="http://www.w3.org/1998/Math/MathML"');
  });

  it("still linkifies bare URLs in the citation text", () => {
    const bib = new Bibliography({ data: SAMPLE_BIB, customFields: ["doi"] });
    expect(bib.formatHtml(bib.entries)).toContain("<a href=");
  });
});
