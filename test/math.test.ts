import { describe, expect, it } from "vitest";
import { Bibliography } from "../src/index.js";

function bibliography(title: string, extra = "", preserveMath = true) {
  return new Bibliography({
    data: String.raw`@article{test, title={${title}}, author={M{\"u}ller, Ada}, year={2025}, doi={10.1234/example}${extra}}`,
    preserveMath,
    customFields: ["project"],
  });
}

const renderMath = (tex: string, { display }: { display: boolean }) =>
  `<math data-display="${display}">${tex}</math>`;

describe("math preservation", () => {
  it.each([
    [String.raw`$\alpha + \frac{1}{\pi}$`, false, String.raw`\alpha + \frac{1}{\pi}`],
    [String.raw`$$x^{a_{b}}$$`, true, "x^{a_{b}}"],
    [String.raw`\(L^2\)`, false, "L^2"],
    [String.raw`\[\sum_{i=1}^n i\]`, true, String.raw`\sum_{i=1}^n i`],
  ])("preserves %s and passes display mode to the renderer", (source, display, tex) => {
    const bib = bibliography(`Estimate for {${source}}`);
    const html = bib.formatHtml(bib.entries, { renderMath });
    expect(html).toContain(`<math data-display="${display}">${tex}</math>`);
    expect(html).toContain("Müller");
    expect(html).not.toContain("bibmathplaceholder");
    expect(bib.entries[0].raw.title).toBe(`Estimate for {${source}}`);
  });

  it("restores escaped original TeX when no renderer is supplied", () => {
    const bib = bibliography(String.raw`An {$a < b \& c$} estimate`);
    expect(bib.formatEntry(bib.entries[0])).toContain(String.raw`$a &lt; b \&amp; c$`);
  });

  it("keeps math inside linked titles and leaves renderer output untouched", () => {
    const bib = bibliography("Estimate for {$L^2$}");
    const html = bib.formatHtml(bib.entries, {
      renderMath: () => '<svg><text>https://example.org/math</text></svg>',
    });
    expect(html).toContain('<a href="https://doi.org/10.1234/example">Estimate for <svg>');
    expect(html).toContain('<text>https://example.org/math</text>');
    expect(html).not.toContain('<text><a');
  });

  it("leaves custom fields and URLs alone", () => {
    const bib = bibliography("{$x$}", String.raw`, project={$metadata$}, url={https://example.org/$value}`);
    expect(bib.entries[0].custom.project).toBe("$metadata$");
    expect(bib.entries[0].raw.url).toBe("https://example.org/$value");
    expect(bib.formatEntry(bib.entries[0])).toContain('href="https://example.org/$value"');
  });

  it("handles escaped dollars without mistaking them for math", () => {
    const bib = bibliography(String.raw`Cost \$5 and {$x + \$1$}`);
    const seen: string[] = [];
    bib.formatHtml(bib.entries, { renderMath: tex => { seen.push(tex); return "MATH"; } });
    expect(seen).toEqual([String.raw`x + \$1`]);
  });

  it.each(["$x", "$$x", String.raw`\(x`, String.raw`\[x`, "$$$$"])(
    "rejects malformed math %s with the key and field", title => {
      expect(() => bibliography(title)).toThrow(/test\.title/);
    },
  );

  it("avoids source collisions and supports repeated rendering", () => {
    const bib = bibliography("bibmathplaceholder0end {$x$} {$x$}");
    const first = bib.formatHtml(bib.entries, { renderMath });
    expect(first).toContain("bibmathplaceholder0end");
    expect(first.match(/<math /g)).toHaveLength(2);
    expect(bib.formatHtml(bib.entries, { renderMath })).toBe(first);
    expect(bib.formatEntry(bib.entries[0])).toContain("$x$");
    expect(bib.formatHtml([])).toBe("");
  });

  it("protects resolved BibTeX strings and concatenations", () => {
    const bib = new Bibliography({
      data: String.raw`@string{prefix = "An $\alpha$ "}
        @article{a, title=prefix # {estimate for {$L^2$}}, author={Doe, Jane}, year={2024}}`,
      preserveMath: true,
    });
    const html = bib.formatHtml(bib.entries, { renderMath });
    expect(html).toContain(String.raw`<math data-display="false">\alpha</math>`);
    expect(html).toContain('<math data-display="false">L^2</math>');
  });

  it("preserves inherited book titles and supports subsets", () => {
    const bib = new Bibliography({
      data: String.raw`@book{parent, title={Methods for {$L^2$}}, author={Doe, Jane}, year={2024}, publisher={Example}}
        @inbook{child, title={An {$\alpha$} estimate}, author={Doe, Jane}, crossref={parent}}`,
      preserveMath: true,
    });
    const child = bib.entries.find(entry => entry.key === "child")!;
    const html = bib.formatHtml([child], { renderMath });
    expect(html).toContain('<math data-display="false">L^2</math>');
    expect(html).toContain(String.raw`<math data-display="false">\alpha</math>`);
  });

  it("restores placeholders after CSL uppercase transformations", () => {
    const bib = new Bibliography({
      data: String.raw`@article{a, title={An {$\alpha$} estimate}, year={2024}}`,
      preserveMath: true,
      cslStyle: `<style xmlns="http://purl.org/net/xbiblio/csl" version="1.0" class="in-text">
        <info><title>Uppercase test</title><id>https://example.org/uppercase-test</id><updated>2025-01-01T00:00:00+00:00</updated></info>
        <citation><layout><text variable="title"/></layout></citation>
        <bibliography><layout><text variable="title" text-case="uppercase"/></layout></bibliography>
      </style>`,
    });
    expect(bib.formatHtml(bib.entries, { renderMath })).toContain(
      String.raw`AN <math data-display="false">\alpha</math> ESTIMATE`,
    );
  });

  it("propagates renderer errors", () => {
    const bib = bibliography("{$x$}");
    expect(() => bib.formatEntry(bib.entries[0], {
      renderMath: () => { throw new Error("Unsupported TeX"); },
    })).toThrow("Unsupported TeX");
  });

  it("does not change default behavior", () => {
    const bib = bibliography(String.raw`An {$L^2$} estimate`, "", false);
    expect(bib.formatHtml(bib.entries)).not.toContain("$L^2$");
    expect(bib.entries[0].csl.title).not.toContain("bibmathplaceholder");
  });
});
