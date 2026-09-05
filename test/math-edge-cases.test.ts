import { describe, expect, it } from "vitest";
import { Bibliography } from "../src/index.js";
import { MathProtector } from "../src/math.js";
import { SAMPLE_BIB } from "./fixtures.js";

const delimiters = [
  ["$", "$", false], ["$$", "$$", true],
  ["\\(", "\\)", false], ["\\[", "\\]", true],
] as const;

// Deterministic round-trip matrix: braces, TeX escapes, HTML-sensitive characters,
// line breaks, and multiple adjacent expressions with every delimiter pairing.
const expressions = [
  "x", String.raw`\frac{1}{\pi}`, String.raw`x^{a_{b}}`,
  String.raw`\text{cost: \$5}`, String.raw`a < b & c > d`,
  String.raw`\begin{matrix}a & b \\ c & d\end{matrix}`,
  "x +\ny", String.raw`\text{a \{brace\}}`,
];

describe("math edge cases", () => {
  for (const [open, close, display] of delimiters) {
    it(`round-trips the expression matrix with ${open} delimiters`, () => {
      for (const tex of expressions) {
        const source = `${open}${tex}${close}`;
        const bib = new Bibliography({
          data: `@article{a, title={Test {${source}}}, author={Doe, Jane}, year={2024}}`,
          preserveMath: true,
        });
        const seen: Array<[string, boolean]> = [];
        const html = bib.formatHtml(bib.entries, {
          renderMath: (actual, context) => {
            seen.push([actual, context.display]);
            return "<span>RENDERED</span>";
          },
        });
        expect(seen).toEqual([[tex, display]]);
        expect(html).not.toContain("bibmathplaceholder");
        expect(bib.entries[0].raw.title).toBe(`Test {${source}}`);
      }
    });
  }

  it("round-trips all adjacent delimiter pairings", () => {
    for (const [openA, closeA, displayA] of delimiters) {
      for (const [openB, closeB, displayB] of delimiters) {
        // A separating space avoids inherently ambiguous runs of dollar signs.
        const title = `${openA}a${closeA} ${openB}b${closeB}`;
        const protector = new MathProtector(title);
        const protectedTitle = protector.protect({ title }, "test").title;
        const seen: Array<[string, boolean]> = [];
        protector.restore(protectedTitle, (tex, { display }) => {
          seen.push([tex, display]); return "";
        });
        expect(seen).toEqual([["a", displayA], ["b", displayB]]);
        expect(protector.restore(protectedTitle)).toBe(title);
      }
    }
  });

  it("uses identical CSL text for identical titles in different entries", () => {
    const bib = new Bibliography({
      data: String.raw`@article{a, title={An {$L^2$} estimate}, author={Doe, Jane}, year={2024}}
        @article{b, title={An {$L^2$} estimate}, author={Roe, Jane}, year={2025}}`,
      preserveMath: true,
    });
    expect(bib.entries[0].csl.title).toBe(bib.entries[1].csl.title);
    const html = bib.formatHtml(bib.entries);
    expect(html.match(/\$L\^2\$/g)).toHaveLength(2);
  });

  it("does not alter non-math bibliography HTML or original metadata", () => {
    const original = new Bibliography({ data: SAMPLE_BIB, customFields: ["project"] });
    const protectedBib = new Bibliography({ data: SAMPLE_BIB, customFields: ["project"], preserveMath: true });
    expect(protectedBib.formatHtml(protectedBib.entries)).toBe(original.formatHtml(original.entries));
    for (let i = 0; i < original.entries.length; i++) {
      expect(protectedBib.entries[i].raw).toEqual(original.entries[i].raw);
      expect(protectedBib.entries[i].custom).toEqual(original.entries[i].custom);
      const { _graph: a, ...originalCsl } = original.entries[i].csl;
      const { _graph: b, ...protectedCsl } = protectedBib.entries[i].csl;
      expect(protectedCsl).toEqual(originalCsl);
    }
  });

  it("handles an empty bibliography", () => {
    const bib = new Bibliography({ data: "", preserveMath: true });
    expect(bib.entries).toEqual([]);
    expect(bib.formatHtml(bib.entries)).toBe("");
  });

  it("HTML-escapes all sensitive characters in fallback TeX", () => {
    const title = `$a < b & c > d + "x" + 'y'$`;
    const protector = new MathProtector(title);
    const protectedTitle = protector.protect({ title }, "test").title;
    expect(protector.restore(protectedTitle)).toBe(
      "$a &lt; b &amp; c &gt; d + &quot;x&quot; + &#39;y&#39;$",
    );
  });

  it("never recursively replaces renderer output", () => {
    const protector = new MathProtector("$x$");
    const protectedTitle = protector.protect({ title: "$x$" }, "test").title;
    expect(protector.restore(protectedTitle, () => protectedTitle)).toBe(protectedTitle);
  });
});
