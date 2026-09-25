/**
 * The library renders with its own citeproc engine (it needs the variable
 * wrapper, which citeproc only accepts at creation). These tests pin that this
 * changes nothing else: without decoration, the output is exactly what
 * citation-js's `cite.format()` produces.
 */
import { describe, expect, it } from "vitest";
import Cite from "citation-js";
import { Bibliography } from "../src/index.js";
import { SAMPLE_BIB } from "./fixtures.js";

const EXTRA = String.raw`
@misc{anonymous, title = {Only a title}, year = {2024}, url = {https://e.org/anon}}
@article{quotes, author = {Doe, Jane}, title = {Don't "quote" \emph{very} large trees}, journal = {J. Comb.}, year = {2024}}
@book{book, author = {Roe, Rick}, editor = {Poe, Edgar}, title = {A Book}, publisher = {Springer}, address = {Berlin}, year = {2019}, edition = {2}}
@phdthesis{thesis, author = {Doe, Jane}, title = {My thesis}, school = {TU Graz}, year = {2017}, month = {mar}}
`;

const BLOCKS = `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0">
  <info><title>Blocks</title><id>engine-test-blocks</id><updated>2026-01-01T00:00:00+00:00</updated></info>
  <citation><layout><text variable="title"/></layout></citation>
  <bibliography><layout>
    <names variable="author" display="block" font-weight="bold"><name and="text"/></names>
    <text variable="title" display="block" font-style="italic"/>
    <group delimiter=", " display="block"><text variable="container-title"/><date variable="issued"><date-part name="year"/></date></group>
  </layout></bibliography>
</style>`;

/** Entry HTML as citation-js renders these entries in one run, csl-entry wrapper removed. */
function citationJs(bib: Bibliography, entries: typeof bib.entries, lang: string): string[] {
  const out = new Cite(entries.map(entry => entry.csl)).format("bibliography", {
    format: "html", template: bib.templateName, lang, nosort: true, asEntryArray: true,
  }) as unknown as Array<[string, string]>;
  return out.map(([, html]) => html.trim().replace(/^<div[^>]*class="csl-entry"[^>]*>([\s\S]*)<\/div>$/, "$1").trim());
}

const undecorated = { titleLink: [], badges: [], linkifyUrls: false };

describe("own engine, same output as citation-js", () => {
  const cases: Array<[string, string]> = [
    ["apa", "en-US"], ["vancouver", "en-US"], ["harvard1", "en-US"], [BLOCKS, "en-US"],
  ];
  for (const [style, lang] of cases) {
    it(`${style.startsWith("<") ? "a block style" : style} (${lang})`, () => {
      const bib = new Bibliography({ data: SAMPLE_BIB + EXTRA, cslStyle: style, lang });
      // Entry by entry, as formatEntry renders them ...
      for (const entry of bib.entries) {
        expect(bib.formatEntry(entry, undecorated), entry.key).toBe(citationJs(bib, [entry], lang)[0]);
      }
      // ... and as one list, where year suffixes and numbering depend on the other entries.
      const list = bib.formatHtml(bib.entries, undecorated).match(/<li[^>]*>[\s\S]*?<\/li>/g)!
        .map(item => item.replace(/^<li[^>]*>|<\/li>$/g, ""));
      expect(list).toEqual(citationJs(bib, bib.entries, lang));
    });
  }

  it("keeps working when entries are rendered repeatedly and in different subsets", () => {
    const bib = new Bibliography({ data: SAMPLE_BIB + EXTRA, cslStyle: "vancouver" });
    const first = bib.formatHtml(bib.entries);
    bib.formatHtml(bib.entries.slice(2));
    bib.formatEntry(bib.entries[3]!);
    expect(bib.formatHtml(bib.entries)).toBe(first);
  });

  it("keeps instances with different styles apart", () => {
    const apa = new Bibliography({ data: SAMPLE_BIB, cslStyle: "apa" });
    const vancouver = new Bibliography({ data: SAMPLE_BIB, cslStyle: "vancouver" });
    const before = apa.formatHtml(apa.entries);
    vancouver.formatHtml(vancouver.entries);
    expect(apa.formatHtml(apa.entries)).toBe(before);
  });
});
