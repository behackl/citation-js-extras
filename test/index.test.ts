import { describe, it, expect } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import Cite from "citation-js";
import { Bibliography, linkifyBareUrls } from "../src/index.js";
import { SAMPLE_BIB } from "./fixtures.js";

function makeBib(overrides: Record<string, unknown> = {}) {
  return new Bibliography({
    data: SAMPLE_BIB,
    customFields: ["publication-status", "arxiv", "mrnumber", "project", "zbl"],
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Parsing & custom fields
// ---------------------------------------------------------------------------

describe("parsing", () => {
  it("exposes declared custom fields, and every field as raw", () => {
    const bib = new Bibliography({ data: SAMPLE_BIB, customFields: ["publication-status", "project"] });
    const widgets = bib.entries.find((e) => e.key.includes("widgets"))!;
    expect(widgets.custom).toEqual({ "publication-status": "published", project: "WidgetFund-1234" });
    expect(widgets.raw.arxiv).toBe("2301.00001");
  });

  it("matches custom fields case-insensitively, keyed as requested", () => {
    const bib = new Bibliography({
      data: "@article{k, title={T}, year={2024}, pubStatus={published}, archivePrefix={arXiv}}",
      customFields: ["pubStatus", "archivePrefix"],
    });
    expect(bib.entries[0]!.custom).toEqual({ pubStatus: "published", archivePrefix: "arXiv" });
  });

  it("rejects duplicate citation keys instead of mixing their fields", () => {
    const data = "@article{a, title={First}, year={2024}}\n@article{a, title={Second}, year={2023}}\n"
      + "@article{b, title={B1}, year={2022}}\n@article{b, title={B2}, year={2021}}";
    expect(() => new Bibliography({ data })).toThrow("Duplicate citation keys: a, b");
    expect(() => new Bibliography({ data, preserveMath: true })).toThrow(/Duplicate citation keys/);
  });

});

// ---------------------------------------------------------------------------
// Input handling
// ---------------------------------------------------------------------------

describe("input handling", () => {
  it("reads files even when the path starts with '@'", () => {
    const tmpPath = join(process.cwd(), "test", "tmp", "@refs.bib");
    mkdirSync(dirname(tmpPath), { recursive: true });
    writeFileSync(tmpPath, "@Article{tmp, author={A B}, title={T}, year={2024}}\n");

    try {
      const bib = new Bibliography({ data: tmpPath });
      expect(bib.entries).toHaveLength(1);
    } finally {
      rmSync(tmpPath, { force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

describe("filter", () => {
  it("returns the entries matching all criteria", () => {
    const bib = makeBib();
    expect(bib.filter({ "publication-status": "published" }).map((e) => e.key))
      .toEqual(["doe-smith:2023:widgets", "doe:2024:gadgets", "smith-doe:2021:conf"]);
    expect(bib.filter({ "publication-status": "published", project: "WidgetFund-1234" }).map((e) => e.key))
      .toEqual(["doe-smith:2023:widgets"]);
  });
});

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

describe("sort", () => {
  it("sorts by year, descending by default", () => {
    const bib = makeBib();
    expect(bib.sort(bib.entries).map((e) => e.year)).toEqual([2025, 2024, 2023, 2022, 2021]);
    expect(bib.sort(bib.entries, { order: "asc" }).map((e) => e.year)).toEqual([2021, 2022, 2023, 2024, 2025]);
  });

  it("sorts by full date: month and day within a year", () => {
    const bib = new Bibliography({
      data: [
        "@misc{jan, title={Jan}, year={2024}, month={jan}}",
        "@misc{year-only, title={Year}, year={2024}}",
        "@misc{nov, title={Nov}, year={2024}, month={nov}}",
        "@misc{older, title={Older}, year={2023}, month={dec}}",
        "@misc{mar, title={Mar}, year={2024}, month={mar}}",
        "@misc{mar-too, title={Mar too}, year={2024}, month={mar}}",
      ].join("\n"),
    });
    const keys = (order: "asc" | "desc") => bib.sort(bib.entries, { by: "date", order }).map((e) => e.key);
    // Ties keep input order in both directions.
    expect(keys("desc")).toEqual(["nov", "mar", "mar-too", "jan", "year-only", "older"]);
    expect(keys("asc")).toEqual(["older", "year-only", "jan", "mar", "mar-too", "nov"]);
    // `year` is unchanged: file order within a year.
    expect(bib.sort(bib.entries).map((e) => e.key)).toEqual(["jan", "year-only", "nov", "mar", "mar-too", "older"]);
  });

  it("does not mutate the input array", () => {
    const bib = makeBib();
    const original = [...bib.entries];
    bib.sort(bib.entries, { order: "asc" });
    expect(bib.entries.map((e) => e.key)).toEqual(original.map((e) => e.key));
  });
});

// ---------------------------------------------------------------------------
// CSL styles
// ---------------------------------------------------------------------------

describe("csl styles", () => {
  it("accepts pre-registered template names", () => {
    const config = Cite.plugins.config.get("@csl");
    const xml = config.templates.data.apa;
    config.templates.add("apa-copy", xml);

    expect(() => {
      const bib = new Bibliography({ data: SAMPLE_BIB, cslStyle: "apa-copy" });
      expect(bib.templateName).toBe("apa-copy");
    }).not.toThrow();
  });

  it("isolates raw XML styles across instances", () => {
    const config = Cite.plugins.config.get("@csl");
    const apaXml = config.templates.data.apa;
    const vancouverXml = config.templates.data.vancouver;

    const bibApa = new Bibliography({ data: SAMPLE_BIB, cslStyle: apaXml });
    const bibVan = new Bibliography({ data: SAMPLE_BIB, cslStyle: vancouverXml });

    expect(bibApa.templateName).not.toBe(bibVan.templateName);

    const entryApa = bibApa.entries.find((e) => e.key.includes("gadgets"))!;
    const entryVan = bibVan.entries.find((e) => e.key.includes("gadgets"))!;

    const apaHtml = bibApa.formatEntry(entryApa);
    const vanHtml = bibVan.formatEntry(entryVan);

    expect(apaHtml).not.toContain('class="csl-left-margin"');
    expect(vanHtml).toContain('class="csl-left-margin"');
  });
});

// ---------------------------------------------------------------------------
// Formatting: title links
// ---------------------------------------------------------------------------

describe("formatEntry – title linking", () => {
  it("links title to URL by default", () => {
    const bib = makeBib();
    const widgets = bib.entries.find((e) => e.key.includes("widgets"))!;
    const html = bib.formatEntry(widgets);
    expect(html).toContain(
      '<a href="https://example.com/widgets">On the Enumeration of Widgets</a>',
    );
  });

  it("falls back to DOI when no URL", () => {
    const bib = makeBib();
    const gadgets = bib.entries.find((e) => e.key.includes("gadgets"))!;
    const html = bib.formatEntry(gadgets);
    expect(html).toContain(
      '<a href="https://doi.org/10.5678/gr.2024.003">Gadgets and their Applications</a>',
    );
  });

  it("respects custom titleLink field order", () => {
    const bib = makeBib();
    const widgets = bib.entries.find((e) => e.key.includes("widgets"))!;
    // DOI first instead of URL
    const html = bib.formatEntry(widgets, { titleLink: ["doi", "url"] });
    expect(html).toContain(
      '<a href="https://doi.org/10.1234/jws.2023.001">On the Enumeration of Widgets</a>',
    );
  });

  it("skips unsafe title-link URLs", () => {
    const bib = new Bibliography({
      data: "@Article{x, author={A B}, title={Unsafe Title URL}, year={2024}, url={javascript:alert(1)}}",
    });
    const html = bib.formatEntry(bib.entries[0]);
    expect(html).not.toContain('href="javascript:alert(1)"');
  });
});

// ---------------------------------------------------------------------------
// Formatting: badges
// ---------------------------------------------------------------------------

const BADGES = [
  { field: "doi", label: "doi", url: "https://doi.org/$1", className: "bib-doi" },
  {
    field: "arxiv",
    label: "arXiv",
    url: "https://arxiv.org/abs/$1",
    match: /^(.+?)(?:v\d+)?$/,
    className: "bib-arxiv",
  },
  {
    field: "mrnumber",
    label: "MR",
    url: "https://mathscinet.ams.org/mathscinet-getitem?mr=$1",
    className: "bib-mr",
  },
  {
    field: "zbl",
    label: "zbMATH",
    url: "https://zbmath.org/?q=an:$1",
    match: /^(\d+\.\d+)$/,
    className: "bib-zbl",
  },
];

describe("formatEntry – badges", () => {
  it("renders doi and arxiv badges", () => {
    const bib = makeBib();
    const widgets = bib.entries.find((e) => e.key.includes("widgets"))!;
    const html = bib.formatEntry(widgets, { badges: BADGES });
    expect(html).toContain('class="bib-doi"');
    expect(html).toContain('href="https://doi.org/10.1234/jws.2023.001"');
    expect(html).toContain('class="bib-arxiv"');
    expect(html).toContain('href="https://arxiv.org/abs/2301.00001"');
  });

  it("strips arXiv version suffix via match regex", () => {
    const bib = makeBib();
    const preprint = bib.entries.find((e) => e.key.includes("preprint"))!;
    const html = bib.formatEntry(preprint, { badges: BADGES });
    // The badge link should have the version stripped
    expect(html).toContain('class="bib-arxiv" href="https://arxiv.org/abs/2501.99999"');
  });

  it("skips badges for missing fields", () => {
    const bib = makeBib();
    const gadgets = bib.entries.find((e) => e.key.includes("gadgets"))!;
    const html = bib.formatEntry(gadgets, { badges: BADGES });
    expect(html).toContain("bib-doi");
    expect(html).not.toContain("bib-arxiv");
    expect(html).not.toContain("bib-mr");
  });

  it("skips badge when match regex fails", () => {
    const bib = new Bibliography({
      data: `@Article{test, author={A B}, title={T}, year={2024}, zbl={not-a-number}}`,
      customFields: ["zbl"],
    });
    const entry = bib.entries[0];
    const html = bib.formatEntry(entry, { badges: BADGES });
    expect(html).not.toContain("bib-zbl");
  });

  it("escapes badge labels", () => {
    const bib = new Bibliography({
      data: "@Article{test, author={A B}, title={T}, year={2024}, doi={10.1/example}}",
      customFields: ["doi"],
    });
    const entry = bib.entries[0];
    const html = bib.formatEntry(entry, {
      badges: [{ field: "doi", label: '<img src=x onerror=alert(1)>', url: "https://doi.org/$1" }],
    });

    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
  });

});

// ---------------------------------------------------------------------------
// Formatting: full HTML list
// ---------------------------------------------------------------------------

describe("formatHtml", () => {
  it("wraps entries in <ol reversed> by default", () => {
    const bib = makeBib();
    const html = bib.formatHtml(bib.entries);
    expect(html).toMatch(/^<ol reversed class="csl-bib-body">/);
    expect(html).toMatch(/<\/ol>$/);
    expect((html.match(/<li /g) ?? []).length).toBe(5);
  });

  it("supports <ul> and <div> wrappers", () => {
    const bib = makeBib();
    const ul = bib.formatHtml(bib.entries, { list: "ul" });
    expect(ul).toMatch(/^<ul class="csl-bib-body">[\s\S]*<\/ul>$/);
    const div = bib.formatHtml(bib.entries, { list: "div" });
    expect(div).toMatch(/^<div class="csl-bib-body">[\s\S]*<\/div>$/);
    expect(div).toContain('<div data-csl-entry-id="doe-smith:2023:widgets" class="csl-entry">');
    expect(div).not.toContain("<li ");
  });

  it("preserves input entry order", () => {
    const bib = makeBib();
    const reversed = [...bib.entries].reverse();
    const html = bib.formatHtml(reversed, { linkifyUrls: false });
    const ids = [...html.matchAll(/data-csl-entry-id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(reversed.map((e) => e.key));
  });

  it("returns empty string for empty input", () => {
    const bib = makeBib();
    expect(bib.formatHtml([])).toBe("");
  });
});

// ---------------------------------------------------------------------------
// URL linkification
// ---------------------------------------------------------------------------

describe("linkifyBareUrls", () => {
  it("linkifies a bare URL", () => {
    expect(linkifyBareUrls("see https://example.com for details")).toBe(
      'see <a href="https://example.com">https://example.com</a> for details',
    );
  });

  it("trims trailing punctuation", () => {
    expect(linkifyBareUrls("Visit https://example.com.")).toBe(
      'Visit <a href="https://example.com">https://example.com</a>.',
    );
  });

  it("linkifies URLs after tag boundaries", () => {
    expect(linkifyBareUrls("<p>https://example.com</p>")).toBe(
      '<p><a href="https://example.com">https://example.com</a></p>',
    );
  });

  it("does not linkify URLs inside attributes", () => {
    const input = '<img src="https://example.com/image.png">';
    expect(linkifyBareUrls(input)).toBe(input);
  });

  it("does not double-linkify existing <a> tags", () => {
    const input = '<a href="https://example.com">link</a>';
    expect(linkifyBareUrls(input)).toBe(input);
  });

  it("does not linkify URLs inside <script> tags", () => {
    const input = '<script>const u = "https://example.com";</script>';
    expect(linkifyBareUrls(input)).toBe(input);
  });

  it("does not linkify URLs inside <style> tags", () => {
    const input = '<style>.bg{background:url(https://example.com/bg.png)}</style>';
    expect(linkifyBareUrls(input)).toBe(input);
  });
});
