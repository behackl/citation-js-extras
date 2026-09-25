/**
 * A page that lays out entries itself (as mr-dynamo's publication page does):
 * authors, title and details as lines from a block style, and a row of badges,
 * project links and the arXiv id built from `links()`. The consumer code here
 * calls the library and parses nothing; only the assertions inspect HTML.
 */
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Bibliography, badgePresets, type BadgeConfig, type BibEntry } from "../src/index.js";
import { REALISTIC_BIB } from "./fixtures.js";

const LAYOUT = fileURLToPath(new URL("./layout.csl", import.meta.url));
const ROUTES = new Map(["Alpha", "Beta", "Gamma", "Delta"].map(code => [code, `/projects/${code.toLowerCase()}/`]));

// --- consumer code -----------------------------------------------------------

function projectBadge(routes: Map<string, string>): BadgeConfig {
  return {
    field: "project",
    split: ",",
    label: code => code,
    url: (code) => {
      const route = routes.get(code);
      if (!route) throw new Error(`unknown project ${code}`);
      return route;
    },
  };
}

function bibliography(routes = ROUTES) {
  return new Bibliography({
    data: REALISTIC_BIB,
    cslStyle: LAYOUT,
    customFields: ["status"],
    preserveMath: true,
    badges: [
      { ...badgePresets.doi, className: "bib-badge" },
      { ...badgePresets.mrnumber, className: "bib-badge" },
      { ...badgePresets.zbl, className: "bib-badge" },
      badgePresets.arxiv,
      projectBadge(routes),
    ],
    appendBadges: false,
    wrapVariable: (html, { variable }) => `<span data-csl-variable="${variable}">${html}</span>`,
  });
}

const renderMath = (tex: string) => `<m>${tex}</m>`;

function layout(bib: Bibliography, entry: BibEntry) {
  const { title, badges } = bib.links(entry);
  return {
    html: bib.formatEntry(entry, { renderMath }),
    titleUrl: title?.url,
    badges: badges.filter(link => link.className).map(link => `${link.label} ${link.url}`),
    projects: badges.filter(link => link.field === "project").map(link => link.value),
    arxiv: badges.find(link => link.field === "arxiv")?.value,
  };
}

// --- assertions ----------------------------------------------------------------

const lines = (html: string) => [...html.matchAll(/<div class="csl-block">([\s\S]*?)<\/div>/g)].map(match => match[1]!);
const unlinkedText = (html: string) => html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/g, "").replace(/<[^>]*>/g, "");

describe("a page that lays out entries itself", () => {
  const bib = bibliography();
  const pages = new Map(bib.entries.map(entry => [entry.key, layout(bib, entry)]));

  it("gets the row as data", () => {
    const row = (key: string) => {
      const { badges, projects, arxiv, titleUrl } = pages.get(key)!;
      return { badges, projects, arxiv, titleUrl };
    };
    expect(row("apostrophe")).toEqual({
      badges: ["DOI https://doi.org/10.5555/jic.2026.160", "MR https://mathscinet.ams.org/mathscinet-getitem?mr=4700001"],
      projects: ["Alpha"], arxiv: "2601.00160", titleUrl: "https://doi.org/10.5555/jic.2026.160",
    });
    expect(row("ampersand")).toEqual({
      badges: ["DOI https://doi.org/10.5555/aia.2025.12"],
      projects: ["Alpha", "Beta"], arxiv: undefined, titleUrl: "https://doi.org/10.5555/aia.2025.12",
    });
    expect(row("doiurl")).toEqual({
      badges: ["DOI https://doi.org/10.5555/ijc.2024.7", "zbMATH https://zbmath.org/?q=an:7800.12345"],
      projects: ["Gamma"], arxiv: "2402.00077", titleUrl: "https://publisher.example/article/7",
    });
    expect(row("archiveprefix")).toEqual({
      badges: [], projects: ["Beta", "Gamma"], arxiv: "2603.00001", titleUrl: "https://arxiv.org/abs/2603.00001",
    });
  });

  it("finds the title line by content, with or without authors", () => {
    for (const [key, page] of pages) {
      const titleLines = lines(page.html).filter(line => line.includes('data-csl-variable="title"'));
      expect(titleLines, key).toHaveLength(1);
      if (page.titleUrl) expect(titleLines[0], key).toContain(`<a href="${page.titleUrl}">`);
    }
    // Without authors the title is the first line: position would mislabel it.
    expect(lines(pages.get("anonymous")!.html)[0]).toContain('data-csl-variable="title"');
  });

  it("prints details where there are any, and none for preprints", () => {
    const details = (key: string) => lines(pages.get(key)!.html).find(line => !/data-csl-variable="(?:author|title)"/.test(line));
    for (const entry of bib.entries.filter(e => e.custom.status === "preprint")) {
      expect(details(entry.key), entry.key).toBeUndefined();
    }
    expect(details("software")).toContain("1.2.0");
    expect(details("thesis")).toContain("Fictional University");
    expect(details("apostrophe")).toContain("Journal of Imaginary Combinatorics");
  });

  it("leaves no identifier as raw text, and renders the math", () => {
    for (const [key, page] of pages) {
      expect(unlinkedText(page.html), key).not.toMatch(/https?:\/\/|10\.5555\//);
    }
    expect(pages.get("ampersand")!.html).toContain("<m>L^p</m>");
  });
});
