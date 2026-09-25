/**
 * The ways into the library for consumers who lay out entries themselves:
 * links as data, attributes on every link, and a wrapper around each variable.
 */
import { describe, expect, it } from "vitest";
import { Bibliography, badgePresets } from "../src/index.js";
import type { BadgeConfig } from "../src/types.js";

const BIB = String.raw`
@article{paper, author = {Doe, Jane}, title = {Don't \emph{very} large trees}, journal = {J. Comb.}, volume = {3}, year = {2024},
  doi = {https://doi.org/10.1000/x}, eprint = {2401.00001v2}, eprinttype = {arxiv}, project = {Gamma, Alpha}}
@misc{preprint, author = {Roe, Rick}, title = {A preprint}, year = {2025}, eprint = {2501.00002}, archivePrefix = {arXiv}}
`;

const project: BadgeConfig = { field: "project", split: ",", label: v => v, url: v => `/projects/${v.toLowerCase()}/` };
const badges = [badgePresets.doi, badgePresets.arxiv, project];

function bib(options: Partial<ConstructorParameters<typeof Bibliography>[0]> = {}) {
  return new Bibliography({ data: BIB, cslStyle: "apa", badges, ...options });
}

describe("links as data", () => {
  it("returns what the HTML shows", () => {
    const b = bib();
    const paper = b.entries[0]!;
    const { title, badges: found } = b.links(paper);
    expect(title).toMatchObject({ kind: "title", field: "doi", value: "10.1000/x", url: "https://doi.org/10.1000/x" });
    expect(found.map(({ field, value, url, label }) => ({ field, value, url, label }))).toEqual([
      { field: "doi", value: "10.1000/x", url: "https://doi.org/10.1000/x", label: "DOI" },
      { field: "arxiv", value: "2401.00001", url: "https://arxiv.org/abs/2401.00001", label: "arXiv" },
      { field: "project", value: "Gamma", url: "/projects/gamma/", label: "Gamma" },
      { field: "project", value: "Alpha", url: "/projects/alpha/", label: "Alpha" },
    ]);
    const html = b.formatEntry(paper);
    for (const link of found) expect(html).toContain(`href="${link.url}">${link.label}</a>`);
  });

  it("leaves badges out of the HTML on request, still withholding them from the style", () => {
    const b = bib();
    const html = b.formatEntry(b.entries[0]!, { appendBadges: false });
    expect(html).not.toContain("bib-links");
    expect(html).not.toContain("arxiv.org");
    // The DOI is the title link and a badge: the style must not print it.
    expect(html.replace(/<a\b[^>]*>/g, "")).not.toContain("10.1000/x");
    expect(html).toContain('<a href="https://doi.org/10.1000/x">');
  });

  it("uses the constructor defaults, overridable per call", () => {
    const b = bib();
    expect(b.links(b.entries[1]!).badges.map(link => link.field)).toEqual(["arxiv"]);
    expect(b.links(b.entries[1]!, { badges: [] }).badges).toEqual([]);
  });
});

describe("linkAttributes", () => {
  it("adds attributes to the title link, badges and fallback", () => {
    const b = bib();
    const html = b.formatEntry(b.entries[0]!, {
      linkAttributes: link => link.kind === "title"
        ? { class: "bib-title" }
        : { class: `badge-${link.field}`, target: "_blank", rel: "noopener" },
    });
    expect(html).toContain('<a class="bib-title" href="https://doi.org/10.1000/x">');
    expect(html).toContain('<a class="badge-doi" href="https://doi.org/10.1000/x" target="_blank" rel="noopener">DOI</a>');
    // The fallback: a style without titles appends the title URL, with the same attributes.
    const noTitles = bib({ cslStyle: `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0">
  <info><title>N</title><id>no-titles</id><updated>2026-01-01T00:00:00+00:00</updated></info>
  <citation><layout><text variable="title"/></layout></citation>
  <bibliography><layout><names variable="author"/></layout></bibliography>
</style>` });
    expect(noTitles.formatEntry(noTitles.entries[0]!, { badges: [], linkAttributes: () => ({ class: "bib-title" }) }))
      .toContain('<a class="bib-title" href="https://doi.org/10.1000/x">https://doi.org/10.1000/x</a>');
  });

  it("can replace a URL, e.g. to add a base path, and still checks it", () => {
    const b = bib();
    const html = b.formatEntry(b.entries[0]!, {
      linkAttributes: link => link.url.startsWith("/") ? { href: `/site${link.url}` } : {},
    });
    expect(html).toContain('href="/site/projects/alpha/">Alpha</a>');
    const unsafe = b.formatEntry(b.entries[0]!, { linkAttributes: () => ({ href: "javascript:alert(1)" }) });
    expect(unsafe).not.toContain("javascript:");
    expect(unsafe).toContain("DOI"); // the label stays, unlinked
  });
});

describe("wrapVariable", () => {
  const mark = (html: string, { variable }: { variable: string }) => `<span data-csl-variable="${variable}">${html}</span>`;

  it("wraps every rendered variable, the title outside its link", () => {
    const b = bib();
    const html = b.formatEntry(b.entries[0]!, { wrapVariable: mark, appendBadges: false });
    // Names report the variable the style's <names> node declares: APA declares
    // `composer` and substitutes `author`, so the authors come out as `composer`.
    for (const variable of ["composer", "issued", "container-title", "volume"]) {
      expect(html).toContain(`data-csl-variable="${variable}"`);
    }
    expect(html).toMatch(/<span data-csl-variable="title"><a href="https:\/\/doi\.org\/10\.1000\/x">/);
  });

  it("receives the entry", () => {
    const b = bib();
    const seen = new Set<string>();
    b.formatHtml(b.entries, { wrapVariable: (html, { entry }) => { seen.add(entry.key); return html; } });
    expect([...seen].sort()).toEqual(["paper", "preprint"]);
  });
});

describe("errors from consumer functions name the entry", () => {
  const fail = () => { throw new Error("route lookup failed"); };
  const cases: Array<[string, object]> = [
    ["badge url", { badges: [{ field: "project", label: "p", url: fail }] }],
    ["badge label", { badges: [{ field: "project", label: fail, url: "#p" }] }],
    ["linkAttributes", { linkAttributes: fail }],
    ["wrapVariable", { wrapVariable: fail }],
    ["itemAttributes", { itemAttributes: fail }],
  ];
  for (const [name, options] of cases) {
    it(name, () => {
      const b = bib();
      let error: Error | undefined;
      try { b.formatHtml(b.entries, options); } catch (e) { error = e as Error; }
      expect(error?.message).toBe("entry paper: route lookup failed");
      expect((error?.cause as Error).message).toBe("route lookup failed");
    });
  }
});
