/**
 * Title links, badges and the identifiers a style may print, on invented
 * entries in the shapes real exports have (`test/realistic.bib`).
 */
import { describe, expect, it } from "vitest";
import { Bibliography, badgePresets } from "../src/index.js";
import type { BadgeConfig } from "../src/types.js";
import { REALISTIC_BIB } from "./fixtures.js";

const PRESETS = [badgePresets.doi, badgePresets.arxiv];

function bib(options: Partial<ConstructorParameters<typeof Bibliography>[0]> = {}, data = REALISTIC_BIB) {
  return new Bibliography({ data, ...options });
}

function entry(b: Bibliography, key: string) {
  return b.entries.find(e => e.key === key)!;
}

/** Visible text outside links: what a reader sees as raw text. */
const unlinkedText = (html: string) =>
  html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/g, "").replace(/<[^>]*>/g, "");

/** A minimal CSL style with the given bibliography layout. */
const style = (layout: string) => `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0">
  <info><title>Test</title><id>test-${layout.length}-${layout.charCodeAt(12)}</id><updated>2026-01-01T00:00:00+00:00</updated></info>
  <citation><layout><text variable="title"/></layout></citation>
  <bibliography><layout>${layout}</layout></bibliography>
</style>`;

describe("title links survive what styles do to titles", () => {
  // The link goes around citeproc's output for the title variable, so the
  // style's typography (’, “ ”, markup, case) can't hide the title from it.
  it("links a title with an apostrophe", () => {
    const b = bib({ cslStyle: "apa" });
    expect(b.formatEntry(entry(b, "apostrophe")))
      .toMatch(/<a href="https:\/\/doi\.org\/10\.5555\/jic\.2026\.160">On Fréchet’s conjecture[^<]*<\/a>/);
  });

  it("links a title with markup and quotes", () => {
    const b = bib({ cslStyle: "apa" });
    expect(b.formatEntry(entry(b, "markup")))
      .toContain('<a href="https://example.org/markup">Growth of <i>very</i> large trees and “quoted” words</a>');
  });

  it("links a title with an ampersand", () => {
    const b = bib({ cslStyle: "apa" });
    expect(b.formatEntry(entry(b, "ampersand")))
      .toMatch(/<a href="https:\/\/doi\.org\/10\.5555\/aia\.2025\.12">Sobolev (?:&#38;|&amp;) Besov estimates/);
  });

  it("links a title the style prints in place of missing authors", () => {
    // citeproc reports it under the names variable, not as `title`.
    const b = bib({ cslStyle: "apa" });
    const html = b.formatEntry(entry(b, "anonymous"));
    expect(html).toMatch(/^(?:<i>)?<a href="https:\/\/example\.org\/editorial">(?:<i>)?Editorial/);
    expect(html.match(/<a [^>]*>(?:<i>)?Editorial/g)).toHaveLength(1);
  });

  it("links a title the style re-cases", () => {
    const b = bib({ cslStyle: style('<text variable="title" text-case="uppercase"/>') });
    expect(b.formatEntry(entry(b, "markup"))).toMatch(/<a href="https:\/\/example\.org\/markup">GROWTH OF <i>VERY<\/i> LARGE TREES/);
  });

  it("links the title only once", () => {
    const b = bib({ cslStyle: style('<text variable="title" suffix=" / "/><text variable="title"/>') });
    const html = b.formatEntry(entry(b, "markup"));
    expect(html.match(/<a href="https:\/\/example\.org\/markup">/g)).toHaveLength(1);
  });

  it("appends the URL when the style does not print the title", () => {
    const b = bib({ cslStyle: style('<names variable="author"/>') });
    const html = b.formatEntry(entry(b, "markup"));
    expect(html).toContain('<a href="https://example.org/markup">https://example.org/markup</a>');
  });
});

describe("linked identifiers are printed once", () => {
  for (const cslStyle of ["apa", "vancouver", "harvard1"]) {
    it(`withholds them from ${cslStyle}`, () => {
      const b = bib({ cslStyle, badges: PRESETS });
      const html = b.formatHtml(b.entries);
      const text = unlinkedText(html);
      expect(text).not.toMatch(/https?:\/\//);
      expect(text).not.toMatch(/10\.\d{4}\//);
      expect(text).not.toMatch(/Available from|\[Internet\]/);
      // The links themselves are all there.
      expect(html).toContain('href="https://doi.org/10.5555/jic.2026.160">DOI</a>');
      expect(html).toContain('href="https://arxiv.org/abs/2601.00160">arXiv</a>');
      // The link covers the title as the style formats it: italics, or quotes.
      expect(html).toMatch(/<a href="https:\/\/example\.org\/slides">(?:<i>|“)?Slides/);
    });
  }

  it("prints them again on request", () => {
    const b = bib({ cslStyle: "apa", badges: PRESETS });
    expect(b.formatEntry(entry(b, "ampersand"), { printLinkedIdentifiers: true }))
      .toContain(">https://doi.org/10.5555/aia.2025.12</a>");
  });

  it("reduces a DOI the style prints to the bare DOI", () => {
    const b = bib({ cslStyle: "apa", badges: [], titleLink: ["url"] });
    const html = b.formatEntry(entry(b, "ampersand"));
    expect(html).toContain(">https://doi.org/10.5555/aia.2025.12</a>");
    expect(html).not.toContain("doi.org/doi:");
    // The entry's own data is left as it is.
    expect(entry(b, "ampersand").csl.DOI).toBe("doi:10.5555/aia.2025.12");
  });

  it("still prints an identifier that is not linked", () => {
    // The title links to the URL and there is no DOI badge: the style keeps the DOI.
    const data = "@article{k, author={Doe, Jane}, title={T}, journal={J}, year={2024}, url={https://e.org/t}, doi={10.1000/kept}}";
    const b = new Bibliography({ data, cslStyle: "apa" });
    expect(b.formatEntry(b.entries[0]!)).toContain("https://doi.org/10.1000/kept");
  });
});

describe("identifiers from biblatex eprint fields", () => {
  it("reads eprint with eprinttype or archivePrefix as arxiv", () => {
    const b = bib({ badges: PRESETS });
    expect(b.formatEntry(entry(b, "apostrophe"))).toContain('href="https://arxiv.org/abs/2601.00160">arXiv</a>');
    expect(b.formatEntry(entry(b, "archiveprefix"))).toContain('href="https://arxiv.org/abs/2603.00001">arXiv</a>');
    expect(b.formatEntry(entry(b, "doiurl"))).toContain('href="https://arxiv.org/abs/2402.00077">arXiv</a>');
  });

  it("links the title to arXiv when there is nothing else", () => {
    const b = bib();
    expect(b.formatEntry(entry(b, "archiveprefix"))).toContain('<a href="https://arxiv.org/abs/2603.00001">From the arXiv export</a>');
  });

  it("serves any eprint archive, and only the one named", () => {
    const halBadge: BadgeConfig = { field: "hal", label: "HAL", url: "https://hal.science/$1" };
    const b = bib({ badges: [badgePresets.arxiv, halBadge] });
    const html = b.formatEntry(entry(b, "hal"));
    expect(html).toContain('href="https://hal.science/hal-01234567">HAL</a>');
    expect(html).not.toContain("arxiv.org");
  });

  it("prefers an explicit arxiv field", () => {
    const b = new Bibliography({
      data: "@misc{k, title={T}, year={2024}, arxiv={1111.11111}, eprint={2222.22222}, eprinttype={arxiv}}",
      badges: PRESETS,
    });
    expect(b.formatEntry(b.entries[0]!)).toContain("arxiv.org/abs/1111.11111");
  });
});

describe("badge presets", () => {
  const spellings = ["10.1000/x1", "doi:10.1000/x1", "https://doi.org/10.1000/x1", "http://dx.doi.org/10.1000/x1"];

  for (const doi of spellings) {
    it(`normalises the DOI ${doi} for badge and title link`, () => {
      const b = new Bibliography({ data: `@article{k, title={T}, journal={J}, year={2024}, doi={${doi}}}`, badges: PRESETS });
      const html = b.formatEntry(b.entries[0]!);
      expect(html).toContain('<a href="https://doi.org/10.1000/x1">T</a>');
      expect(html).toContain('href="https://doi.org/10.1000/x1">DOI</a>');
    });
  }

  it("normalises arXiv, MR and zbMATH identifiers", () => {
    const b = new Bibliography({
      data: "@article{k, title={T}, year={2024}, arxiv={arXiv:2301.00001v3}, mrnumber={MR1234567}, zbl={Zbl 1234.56789}}",
      badges: Object.values(badgePresets),
    });
    const html = b.formatEntry(b.entries[0]!);
    expect(html).toContain('href="https://arxiv.org/abs/2301.00001">arXiv</a>');
    expect(html).toContain('href="https://mathscinet.ams.org/mathscinet-getitem?mr=1234567">MR</a>');
    expect(html).toContain('href="https://zbmath.org/?q=an:1234.56789">zbMATH</a>');
  });

  it("can be customised by spreading, and not by mutation", () => {
    const b = new Bibliography({ data: "@article{k, title={T}, year={2024}, doi={10.1000/x}}" });
    expect(b.formatEntry(b.entries[0]!, { badges: [{ ...badgePresets.doi, className: "badge" }] }))
      .toContain('<a class="badge" href="https://doi.org/10.1000/x">DOI</a>');
    expect(Object.isFrozen(badgePresets.doi)).toBe(true);
  });
});

describe("badge functions and relative URLs", () => {
  const data = "@article{k, title={T}, journal={J}, year={2024}, Project={Alpha}}";

  it("computes label and URL from the matched value and the entry", () => {
    const b = new Bibliography({ data });
    const html = b.formatEntry(b.entries[0]!, {
      badges: [{
        field: "project",
        label: value => value,
        url: (value, e) => `/projects/${value.toLowerCase()}/#${e.key}`,
      }],
    });
    expect(html).toContain('<a href="/projects/alpha/#k">Alpha</a>');
  });

  it("renders one badge per value of a split field, in the entry's order", () => {
    const b = new Bibliography({ data: "@article{k, title={T}, journal={J}, year={2024}, Project={Beta, Alpha,}}" });
    const project: BadgeConfig = {
      field: "project", split: ",", label: value => value, url: value => `/projects/${value.toLowerCase()}/`,
    };
    const html = b.formatEntry(b.entries[0]!, { badges: [project] });
    expect(html).toContain('<span class="bib-links"><a href="/projects/beta/">Beta</a> <a href="/projects/alpha/">Alpha</a></span>');
    // The title links to the first value when the field is a title-link field.
    expect(b.formatEntry(b.entries[0]!, { badges: [project], titleLink: ["project"] }))
      .toContain('<a href="/projects/beta/">T</a>');
  });

  it("computes a class per value", () => {
    const b = new Bibliography({ data: "@article{k, title={T}, year={2024}, Project={Beta, Alpha}}" });
    const html = b.formatEntry(b.entries[0]!, {
      badges: [{ field: "project", split: ",", label: v => v, url: v => `#${v}`, className: "project" }],
      linkAttributes: link => link.kind === "badge" ? { class: `project-${link.value.toLowerCase()}` } : {},
    });
    expect(html).toContain('<a class="project project-beta" href="#Beta">Beta</a>');
    expect(html).toContain('<a class="project project-alpha" href="#Alpha">Alpha</a>');
  });

  it("applies match to each split value and accepts a pattern", () => {
    const b = new Bibliography({ data: "@article{k, title={T}, year={2024}, projects={P-1 and X and P-2}}" });
    const html = b.formatEntry(b.entries[0]!, {
      badges: [{ field: "projects", split: /\s+and\s+/, match: /^P-(\d+)$/, label: v => `P${v}`, url: "#p$1" }],
    });
    expect(html).toContain('<a href="#p1">P1</a> <a href="#p2">P2</a>');
    expect(html).not.toContain("X");
  });

  it("keeps relative URLs and drops other schemes", () => {
    const b = new Bibliography({ data });
    const html = b.formatEntry(b.entries[0]!, {
      badges: ["./a", "../b", "#c", "?d", "data:text/html,x", "javascript:alert(1)"].map((url, i) => ({
        field: "project", label: `L${i}`, url,
      })),
    });
    for (const url of ["./a", "../b", "#c", "?d"]) expect(html).toContain(`href="${url}"`);
    expect(html).not.toMatch(/data:|javascript:/);
  });

  it("links a title to a site-relative URL", () => {
    const b = new Bibliography({ data: "@misc{k, title={Talk slides}, year={2024}, url={/files/slides.pdf}}" });
    expect(b.formatEntry(b.entries[0]!)).toContain('<a href="/files/slides.pdf">Talk slides</a>');
  });

  it("inserts the value literally into a URL template", () => {
    // `$&` means "the match" in a replacement string; the value must not.
    const b = new Bibliography({ data: "@misc{k, title={T}, year={2024}, code={x}}" });
    b.entries[0]!.raw.code = "a$&b";
    expect(b.formatEntry(b.entries[0]!, { badges: [{ field: "code", label: "c", url: "https://e.org/$1" }] }))
      .toContain('href="https://e.org/a$&amp;b"');
  });
});
