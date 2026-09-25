# Changelog

## 0.3.0 (unreleased)

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

## 0.2.1 and earlier

See the [git history](https://github.com/behackl/citation-js-extras/commits/main).
