# Changelog

## 0.3.0 (unreleased)

**Your own layout.** Pages can lay out entries however their design wants:
the CSL style produces the lines (`display="block"`), `wrapVariable` marks
their parts for CSS, and `bib.links(entry)` hands over the title link and
badges as data, to render as router links or wherever the design puts them.
Nothing needs parsing, nothing needs reimplementing. See
[Laying out entries yourself](docs/layout.md#laying-out-entries-yourself).

**Links, printed once.** Titles are linked exactly, and a DOI or URL that is
linked is no longer printed again as text by the style. BibTeX from Zotero,
JabRef, biblatex or arXiv works as exported: DOIs in any spelling, arXiv ids in
`eprint`.

### Added

- `badgePresets` for DOI, arXiv, MathSciNet and zbMATH, accepting the
  spellings real exports use.
- Eprint fields: a badge or title link for `arxiv` (or `hal`, …) reads
  biblatex's `eprint` when `eprinttype`/`archivePrefix` names that archive.
- Badges: `label` and `url` as functions, `split` for list fields, relative
  URLs.
- `bib.links(entry)` returns an entry's links as data; `appendBadges: false`
  leaves the badges out of the HTML.
- `linkAttributes`, `wrapVariable`, `itemAttributes`, `badgeListClassName`.
- `sanitize`, applied before rendered math is inserted.
- `lang`, for the style's locale.
- `sort({ by: "date" })`.
- All formatting options can be given to the constructor as defaults.

### Changed

- Identifiers that are linked (the title link, badges) are no longer printed by
  the style as well. `printLinkedIdentifiers: true` restores the old output.
- Titles are linked while citeproc renders them, which is exact whatever the
  style does to the title. The link now sits outside the style's formatting of
  the title (`<a><i>Title</i></a>`, not `<i><a>Title</a></i>`). A title the
  style doesn't print gets its URL appended.
- Bare URLs are linked per variable, not in text the style adds around them.
- A DOI the style prints is reduced to the bare DOI.
- `customFields` and badge fields are matched case-insensitively.
- `citeproc` is a direct dependency, in the range citation-js uses.

### Fixed

- Duplicate citation keys throw instead of mixing up the entries' fields.
- `listAttributes: { class }` no longer writes a second `class` attribute.
- Titles with typographic quotes, markup or changed capitalisation lost their
  link.
- Errors from functions you pass in name the entry they occurred for.

## 0.2.1 (2026-09-18)

### Added

- `titleLink`, `badges` and `linkifyUrls` can be given to the constructor as
  defaults for every call.
- A `renderMath` error names the entry the formula came from.

### Fixed

- `formatEntry` ignored `linkifyUrls`; only `formatHtml` applied it. Both now
  linkify bare URLs by default. Pass `linkifyUrls: false` if you relied on
  `formatEntry` leaving them alone.

## 0.2.0 (2026-09-06)

### Added

- `preserveMath` keeps TeX in titles intact through the formatting, for
  `renderMath` (MathJax, KaTeX, …) or for typesetting in the browser.

### Fixed

- TypeScript declarations resolve under both NodeNext and Bundler resolution.

## 0.1.0 (2026-02-17)

First release: custom BibTeX fields that citation-js drops are kept on each
entry; `filter` and `sort`; `formatHtml` and `formatEntry` with any CSL style,
linked titles and configurable badges; `linkifyBareUrls`.
