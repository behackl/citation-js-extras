# API reference

```ts
import { Bibliography, badgePresets, linkifyBareUrls } from "@behackl/citation-js-extras";
import type { BadgeConfig, BibEntry, EntryLinks, FormatOptions, Link } from "@behackl/citation-js-extras";
```

## `new Bibliography(options)`

Parses the BibTeX once; format as often as you like.

| Option | Type | Default | |
|---|---|---|---|
| `data` | `string` | — | BibTeX text, or a path to a `.bib` file |
| `cslStyle` | `string` | `'apa'` | a style registered with citation-js (`apa`, `vancouver`, `harvard1`), a path to a `.csl` file, or CSL XML |
| `customFields` | `string[]` | `[]` | fields to copy to `entry.custom`, matched case-insensitively and keyed as given |
| `preserveMath` | `boolean` | `false` | keep `$…$` in titles intact for `renderMath`; see [Mathematics](math.md) |

Every [formatting option](#formatting-options) except `renderMath`, `list` and
`listAttributes` can be given here too, as a default for all calls.

The constructor throws on BibTeX syntax errors (with line and column), on an
unknown style, and on duplicate citation keys.

## `bib.entries`

All entries, in the order of the `.bib` file.

```ts
interface BibEntry {
  key: string;                    // citation key
  year: number | null;
  custom: Record<string, string>; // the `customFields` present on this entry
  raw: Record<string, any>;       // every BibTeX field, lowercase names
  csl: Record<string, any>;       // CSL-JSON, as citeproc sees it
}
```

With `preserveMath`, text fields in `csl` contain placeholders for formulas;
use `raw` for the original text.

## `bib.filter(criteria)`

The entries whose `custom` fields equal all of the given values.

```ts
bib.filter({ status: "published" });
bib.filter({ status: "published", project: "Alpha" });
```

For anything else, filter `bib.entries` directly.

## `bib.sort(entries, options?)`

A sorted copy. Ties keep their input order.

```ts
bib.sort(entries);                          // by year, newest first
bib.sort(entries, { by: "date" });          // year, month, day
bib.sort(entries, { order: "asc" });        // oldest first
bib.sort(entries, { by: "status" });        // by a custom field
```

With `by: "date"`, a missing month or day counts as 0: an entry with only a
year comes after the dated entries of that year, newest first.

## `bib.formatHtml(entries, options?)`

A complete list:

```html
<ol reversed class="csl-bib-body">
<li data-csl-entry-id="…" class="csl-entry">…</li>
</ol>
```

All entries are formatted in one pass, so numbering and year suffixes
(2024a, 2024b) are right within the list. An empty list returns `""`.

## `bib.formatEntry(entry, options?)`

One entry's HTML, without a wrapper. Takes the same options as `formatHtml`;
`list`, `listAttributes` and `itemAttributes` have no effect. Numbered styles
number every single entry `1.`; use `formatHtml` for those.

## `bib.links(entry, options?)`

The links an entry gets with these options, as data. It uses the same
resolution as the HTML, so the two always agree.

```ts
interface EntryLinks {
  title?: Link;   // the title link
  badges: Link[]; // one per badge, and one per value of a `split` field
}

interface Link {
  kind: "title" | "badge";
  field: string;      // the configured field, e.g. "doi"
  value: string;      // the matched value, e.g. "10.5555/aia.2025.12"
  url: string;
  label?: string;     // badges only
  className?: string; // badges only
  entry: BibEntry;
}
```

See [Laying out entries yourself](layout.md#laying-out-entries-yourself).

## Formatting options

Given to `formatHtml`, `formatEntry` or `links`, or to the constructor as defaults.

| Option | Default | |
|---|---|---|
| `titleLink` | `['url', 'doi', 'arxiv']` | fields for the title link, tried in order; see [Title links](links.md#title-links) |
| `badges` | `[]` | links after each entry; see [Badges](links.md#badges) |
| `linkAttributes` | — | `(link) => attributes` for every link; see [Link attributes](links.md#link-attributes) |
| `printLinkedIdentifiers` | `false` | let the style print identifiers that are already linked |
| `linkifyUrls` | `true` | turn bare URLs the style prints into links |
| `appendBadges` | `true` | `false` leaves the badges out of the HTML |
| `badgeListClassName` | `'bib-links'` | class of the `<span>` around the badges |
| `itemAttributes` | — | `(entry) => attributes` for each `<li>` |
| `wrapVariable` | — | `(html, { variable, entry }) => html` for each rendered variable |
| `lang` | `'en-US'` | locale of the style's terms and dates |
| `sanitize` | — | `(html) => html`, applied before math is inserted |
| `renderMath` | — | `(tex, { display }) => html`; per call only |
| `list` | `'ol'` | `'ol'`, `'ul'` or `'div'`; per call only |
| `listAttributes` | `{ reversed: true }` for `ol` | attributes of the list; per call only |

Attributes are objects: `true` writes a bare attribute, `false` omits it. A
`class` you give is added to the library's own.

If a function you pass in throws, the error names the entry
(`entry lindqvist2025: …`) and keeps yours as `cause`.

## `BadgeConfig`

```ts
interface BadgeConfig {
  field: string;                             // BibTeX field, case-insensitive
  label: string | ((value, entry) => string);
  url: string | ((value, entry) => string);  // in a string, $1 is the value
  match?: RegExp;                            // skip unless it matches; $1 is the first group
  split?: string | RegExp;                   // one badge per value of a list field
  className?: string;
}
```

See [Badges](links.md#badges).

## `badgePresets`

Badges for `doi`, `arxiv`, `mrnumber` and `zbl`; see [Presets](links.md#presets).

## `linkifyBareUrls(html)`

Links bare `http(s)://` URLs in the text of an HTML string, outside `<a>`,
`<script>` and `<style>`. Trailing punctuation stays outside the link.

```ts
linkifyBareUrls("See https://example.com.");
// 'See <a href="https://example.com">https://example.com</a>.'
```
