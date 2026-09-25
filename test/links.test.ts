/**
 * Title links, on invented entries in the shapes real exports have
 * (`test/realistic.bib`).
 */
import { describe, expect, it } from "vitest";
import { Bibliography } from "../src/index.js";
import { REALISTIC_BIB } from "./fixtures.js";

function bib(options: Partial<ConstructorParameters<typeof Bibliography>[0]> = {}, data = REALISTIC_BIB) {
  return new Bibliography({ data, ...options });
}

function entry(b: Bibliography, key: string) {
  return b.entries.find(e => e.key === key)!;
}

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
