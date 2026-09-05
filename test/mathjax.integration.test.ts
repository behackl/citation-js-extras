import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { Bibliography } from "../src/index.js";

// Use MathJax's Node entry points, including explicit AMS registration. This is
// deliberately the actual renderer, not a mock or another checkout's dependency.
const require = createRequire(import.meta.url);
const { mathjax } = require("@mathjax/src/js/mathjax.js");
const { TeX } = require("@mathjax/src/js/input/tex.js");
require("@mathjax/src/js/input/tex/ams/AmsConfiguration.js");
const { SVG } = require("@mathjax/src/js/output/svg.js");
const { liteAdaptor } = require("@mathjax/src/js/adaptors/liteAdaptor.js");
const { RegisterHTMLHandler } = require("@mathjax/src/js/handlers/html.js");
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

function renderer() {
  const document = mathjax.document("", {
    InputJax: new TeX({ packages: ["base", "ams"] }),
    OutputJax: new SVG({ fontCache: "none" }),
  });
  return (tex: string, { display }: { display: boolean }): string => {
    const html = adaptor.outerHTML(document.convert(tex, { display }));
    // MathJax can return an error node rather than throw. Do not count that as
    // a successful render merely because it contains an SVG container.
    if (html.includes("data-mjx-error")) throw new Error(`MathJax failed: ${tex}`);
    return html;
  };
}

const expressions = [
  "L^2",
  String.raw`\alpha + \frac{1}{\pi}`,
  String.raw`\sum_{i=1}^{n} i`,
  String.raw`\begin{matrix}a & b \\ c & d\end{matrix}`,
  String.raw`x^{a_{b}}`,
  String.raw`\text{cost: \$5}`,
];
const delimiters = [
  ["$", "$", false], ["$$", "$$", true],
  ["\\(", "\\)", false], ["\\[", "\\]", true],
] as const;

describe("Citation.js → protected math → MathJax SVG", () => {
  for (const [open, close, display] of delimiters) {
    it.each(expressions)(`${open}…${close}: renders %s`, tex => {
      const bib = new Bibliography({
        data: String.raw`@article{test,
          title={Estimate for {${open}${tex}${close}}},
          author={M{\"u}ller, Ada}, year={2025}, doi={10.1234/example}
        }`,
        preserveMath: true,
      });
      const renderMath = renderer();
      const html = bib.formatHtml(bib.entries, { renderMath });
      expect(html).toContain("Müller");
      expect(html).toContain('<a href="https://doi.org/10.1234/example">Estimate for <mjx-container');
      expect(html.match(/<mjx-container\b/g)).toHaveLength(1);
      expect(html).toContain('<svg');
      expect(html).toContain('<path');
      expect(html.includes('display="true"')).toBe(display);
      expect(html).not.toContain("bibmathplaceholder");
      expect(html).not.toContain("data-mjx-error");
      // Single-entry output uses the same final restoration path.
      expect(bib.formatEntry(bib.entries[0], { renderMath })).toContain('<svg');
    });
  }

  it("reports invalid TeX instead of silently accepting an error SVG", () => {
    const bib = new Bibliography({
      data: String.raw`@article{bad, title={An {$\notARealCommand$} estimate}, year={2025}}`,
      preserveMath: true,
    });
    expect(() => bib.formatHtml(bib.entries, { renderMath: renderer() })).toThrow("MathJax failed");
  });

  it("renders math in journal titles as well as publication titles", () => {
    const bib = new Bibliography({
      data: String.raw`@article{journal,
        title={An {$L^2$} estimate}, journal={Journal of {$\alpha$}},
        author={Doe, Jane}, year={2025}
      }`,
      preserveMath: true,
    });
    const html = bib.formatHtml(bib.entries, { renderMath: renderer() });
    expect(html.match(/<mjx-container\b/g)).toHaveLength(2);
    expect(html).not.toContain("bibmathplaceholder");
  });
});
