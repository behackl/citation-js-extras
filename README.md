# @behackl/citation-js-extras

![NPM Version](https://img.shields.io/npm/v/%40behackl%2Fcitation-js-extras)

Preserve custom BibTeX fields through [citation-js](https://citation.js.org/) and render academic bibliographies with linked titles, configurable badges, and more.

## The problem

citation-js converts BibTeX to CSL-JSON, but silently **drops all non-standard fields** during the conversion. There is no plugin hook or configuration option to preserve them. Fields like `arxiv`, `mrnumber`, `publication-status`, or project identifiers are lost.

This package solves the problem with a two-pass parsing strategy: one pass extracts the raw BibTeX fields, the other produces CSL-JSON for formatting. The results are merged so you get the best of both worlds.

## Install

```bash
npm install @behackl/citation-js-extras citation-js
# or
pnpm add @behackl/citation-js-extras citation-js
```

`citation-js` is a **peer dependency** — you bring your own version.

## Quick start

```ts
import { Bibliography, badgePresets } from "@behackl/citation-js-extras";

const bib = new Bibliography({
  data: "./references.bib", // file path or raw BibTeX string
  cslStyle: "./my-style.csl", // optional: file path, raw XML, or registered template name
  customFields: ["publication-status"],
  badges: [badgePresets.doi, badgePresets.arxiv, badgePresets.mrnumber],
});

// Filter and sort
const published = bib.filter({ "publication-status": "published" });
const sorted = bib.sort(published, { by: "date", order: "desc" });

// Render HTML: titles link to the url, doi or arXiv id; badges follow each entry.
const html = bib.formatHtml(sorted);
```

A DOI, URL or arXiv id that is linked (as the title link or a badge) is not
printed again as text by the style. `doi = {https://doi.org/10…}` and
`eprint = {2301.00001}, eprinttype = {arxiv}` work as exported.

## Customising

Everything is changed through a handful of options; each accepts a plain value
for the common case and a function where a value is not enough.

| To change | Use |
|---|---|
| which BibTeX fields you can read | `customFields` (on `entry.custom`); `entry.raw` has all of them |
| which fields become links after an entry | `badges`: presets, templates (`$1`), or `(value, entry) => …` functions |
| where the title links to | `titleLink`: field names, tried in order |
| attributes of the links (class, `target`, a base path) | `linkAttributes` |
| laying out links yourself | `bib.links(entry)`, with `appendBadges: false` |
| markers on parts of the citation, for CSS | `wrapVariable` |
| whether the style prints linked identifiers too | `printLinkedIdentifiers` |
| how entries are written | the CSL style (`cslStyle`) and its locale (`lang`) |
| the markup around entries | `list`, `listAttributes`, `itemAttributes`, `badgeListClassName` |
| what reaches the page | `sanitize`, then `renderMath` for formulas |
| order and selection | `sort` (`year`, `date`, a custom field) and `filter`, or plain array methods on `bib.entries` |

All formatting options can be set on the constructor and overridden per call,
except `renderMath`, `list` and `listAttributes`, which are per call only.

## Preserving mathematics

Citation.js normally converts TeX math to text, losing delimiters and potentially
complex expressions. Enable preservation before parsing:

```ts
const bib = new Bibliography({
  data: "./references.bib",
  preserveMath: true,
});

// Restore HTML-escaped original TeX for client-side MathJax:
const html = bib.formatHtml(bib.entries);

// Or typeset at build time with your own synchronous renderer:
const rendered = bib.formatHtml(bib.entries, {
  renderMath: (tex, { display }) => myMathRenderer(tex, display),
});
```

`myMathRenderer` is an application-supplied function returning **trusted HTML**
(e.g. MathJax SVG or KaTeX output). No math renderer is bundled. Configure it for
untrusted TeX as appropriate; the callback output is inserted verbatim, not
sanitized. Treat renderer output as untrusted HTML unless you control both the
renderer configuration and the TeX: substitute it only after the surrounding
HTML has been sanitized (see below). Exceptions propagate to the caller. `renderMath` also works with
`formatEntry`; it has no effect unless `preserveMath` was enabled.

Supported delimiters are `$…$`, `$$…$$`, `\(…\)`, and `\[…\]`.
Escape literal dollars as `\$`. Empty or unclosed expressions throw with the
citation key and field name. This is a delimiter scanner, not a TeX validator:
unsupported commands and mathematical validity are the renderer's responsibility.

Protection covers `title`, `subtitle`, `titleaddon`, `shorttitle`, `booktitle`,
`booksubtitle`, `booktitleaddon`, `maintitle`, `mainsubtitle`, `maintitleaddon`,
`journaltitle`, `journalsubtitle`, `journal`, `note`, `annote`, `abstract`, and
`howpublished`. Fields still need to be supported by Citation.js and the chosen
CSL style to appear in the output. Names, identifiers, URLs, and custom metadata
are not protected. BibTeX strings and concatenations are resolved before protection;
inherited cross-reference text is protected during conversion.

Original `.raw` and `.custom` values remain unchanged. With preservation enabled,
`.csl` contains internal placeholders: use the formatting methods for HTML and
raw fields for original source text, not `.csl` for plain-text exports. Placeholders
also mean CSL title-based sorting/disambiguation operates on protected text rather
than mathematical meaning. Existing caller-controlled ordering is retained.

Restoration runs last: after title linking, badges, URL linkification and
`sanitize`. Neither renderer output nor restored TeX is fed back through these
HTML helpers. Disabling preservation (the default) retains the previous behavior.

If `renderMath` throws, the error names the entry it came from
(`entry doe:2024: Undefined control sequence: \\kk`), so a broken formula can be
traced to a line in the `.bib` file.

### Sanitizing formatted output

Rendered mathematics does **not** survive an HTML sanitizer with default
settings: KaTeX and MathJax output relies on `class`, `style` and MathML
elements that `rehype-sanitize` strips, leaving empty boxes. Pass the sanitizer
as `sanitize`: it runs on the finished HTML while formulas are still
placeholders, and the rendered math is inserted afterwards.

```js
const html = bib.formatHtml(entries, {
  renderMath: (tex, { display }) => renderWithKatex(tex, display),
  sanitize: (html) => String(sanitizer.processSync(html)),
});
```

A renderer error still names the entry it came from. With `rehype-sanitize`,
note that its `defaultSchema` allows `className` only with an explicit value
list *per tag*, and that per-tag rule overrides anything added under `'*'`: to
keep the classes listed under [Output markup](#output-markup), merge them into
the existing entry for each tag. The same goes for attributes: `defaultSchema`
drops `data-csl-entry-id` (`dataCslEntryId` in its terms) and any `data-*`
attribute you add through `wrapVariable` or `itemAttributes`. Class names you
compute (e.g. one per project) need a pattern rather than a list of values.

This deliberately inserts renderer output *after* sanitizing, so it is
only as safe as the renderer: a renderer configured to emit arbitrary markup
(for instance KaTeX with `trust: true`) can reintroduce `<script>`. Restrict the
renderer configuration, or sanitize its output separately with a schema that
keeps the elements and attributes mathematics needs.

## Development checks

```sh
pnpm install --frozen-lockfile
pnpm test          # Unit tests and actual MathJax SVG integration (base + AMS)
pnpm test:package  # Build, pack, install into a temporary consumer, and test exports
```

The package check validates ESM imports, TypeScript declarations under both
NodeNext and Bundler resolution, and MathJax rendering through the installed
tarball. Its temporary consumer is removed afterwards. Installation prefers the
local cache but may need registry access on a fresh machine. CI runs both checks.
MathJax is a development-only dependency, not a runtime dependency for consumers.
Use Node 24 LTS for these development checks, matching CI and publishing.

## API

### `new Bibliography(options)`

| Option | Type | Description |
|---|---|---|
| `data` | `string` | BibTeX input — a raw string or a file path. |
| `cslStyle` | `string?` | CSL style — a registered template name, raw XML, or a file path. Defaults to `'apa'`. |
| `customFields` | `string[]?` | BibTeX field names to preserve. These appear on each entry under `.custom`, keyed as given; matching is case-insensitive like BibTeX. |
| `preserveMath` | `boolean?` | Preserve math in display-text fields through CSL formatting. Defaults to `false`. |
| `titleLink` | `string[]?` | Default fields used for the title link, checked in order. Defaults to `['url', 'doi', 'arxiv']`. |
| `badges` | `BadgeConfig[]?` | Default badge configuration, used by every `formatHtml`/`formatEntry` call. No badges are rendered unless set. |
| `linkifyUrls` | `boolean?` | Default for URL linkification. Defaults to `true`. |
| `printLinkedIdentifiers` | `boolean?` | Let the style print identifiers that are already linked. Defaults to `false`. |
| `lang` | `string?` | Locale of the style's terms and dates. Defaults to `'en-US'`; citation-js also ships `de-DE`, `fr-FR`, `es-ES`, `nl-NL`. |
| `sanitize` | `(html) => string` | Sanitizer for the finished HTML, before math is inserted. |
| `itemAttributes`, `badgeListClassName` | | See [Output markup](#output-markup). |

The formatting options are usually the same for every call, so they can be set
once here; a value passed to `formatHtml`/`formatEntry` overrides the default
for that call.

The constructor throws on duplicate citation keys: their fields would otherwise
be mixed up between the two entries.

### `bib.entries`

All parsed entries as `BibEntry[]`:

```ts
interface BibEntry {
  csl: Record<string, any>; // CSL-JSON data (for citation-js)
  key: string; // BibTeX citation key
  year: number | null; // extracted from CSL `issued`
  custom: Record<string, string>; // declared custom fields
  raw: Record<string, any>; // all raw BibTeX properties
}
```

### `bib.filter(criteria)`

Filter entries by custom field values. All criteria must match (AND logic).

```ts
bib.filter({ "publication-status": "published" });
bib.filter({ "publication-status": "published", project: "ABC-123" });
```

### `bib.sort(entries, options?)`

Return a sorted **copy** of the entries (the input is not mutated).

```ts
bib.sort(entries); // by year, descending (default)
bib.sort(entries, { by: "date" }); // year, then month, then day
bib.sort(entries, { by: "year", order: "asc" });
bib.sort(entries, { by: "publication-status" }); // a custom field
```

Ties keep their input order (the order of the `.bib` file, for `bib.entries`).
With `date`, a missing month or day counts as 0, so a year-only entry follows
the dated entries of its year when sorting in descending order.

### `bib.formatHtml(entries, options?)`

Render entries as a complete HTML bibliography list.

```ts
bib.formatHtml(entries, {
  titleLink: ["url", "doi", "arxiv"],
  badges: [ /* ... */ ],
  list: "ol", // 'ol', 'ul', or 'div' (div uses <div class="csl-entry"> children)
  listAttributes: { reversed: true, class: "publications" },
  itemAttributes: (entry) => ({ id: `pub-${entry.key}` }),
  linkifyUrls: true,
  printLinkedIdentifiers: false,
  lang: "en-US",
  sanitize: (html) => html,
  renderMath: (tex, { display }) => tex,
});
```

Entries are formatted in one citeproc pass, so style-dependent state (for example numeric labels in Vancouver) remains correct.

An empty entry list returns an empty string, not an empty wrapper element.

### `bib.formatEntry(entry, options?)`

Render a single entry as an HTML string (no list wrapper). The title link targets the actual CSL title text, regardless of italics.

Accepts the same options as `formatHtml` and applies them identically (`list`, `listAttributes` and `itemAttributes` are ignored — there is no wrapper). Bare URLs are linkified unless `linkifyUrls: false` is set, either per call or on the constructor.

For citation styles that depend on multi-entry context (numbered labels, ibid behavior, etc.), prefer `formatHtml(...)`.

### Title links

The title links to the first of the `titleLink` fields (default `url`, `doi`,
`arxiv`) that yields a URL. A field with a [preset](#presets) is expanded by it,
so `doi = {doi:10.1000/x}` links to `https://doi.org/10.1000/x`. Another field
uses the configured badge for that field, if there is one; otherwise it must
hold a URL itself (`http(s)`, `mailto`, or relative, e.g. `/files/paper.pdf`).

The link is added while citeproc renders the title, around exactly what the
style prints for it: typographic quotes (`'` printed as `’`), markup
(`\emph{…}` printed as `<i>…</i>`), a different capitalisation, and the style's
own italics or quotes, which end up inside the link. A title the style prints in
place of missing authors (as APA does) is linked too. If the style doesn't print
the title at all, the URL is appended as a plain link rather than lost.

The field used for the title link and the field of every rendered badge are
withheld from the style, so they are not printed again as text: no
`https://doi.org/…` after a DOI badge, no "Available from: …" after a linked
title. Set `printLinkedIdentifiers: true` to let the style print them anyway.
A DOI the style does print is reduced to the bare DOI first, so `doi:10…` or
`https://doi.org/10…` in the data doesn't come out as `https://doi.org/doi:10…`.

Bare `http(s)://` URLs in what the style prints (for instance in a `note`)
become links unless `linkifyUrls: false`. This happens per variable while
citeproc renders, so text the style adds around variables is left alone.

### Badges

Badges are small inline links appended to each entry. They are configured declaratively:

```ts
interface BadgeConfig {
  field: string; // BibTeX field to read (case-insensitive)
  label: string | ((value, entry) => string); // display text (e.g. "DOI", "arXiv")
  url: string | ((value, entry) => string); // template — $1 is replaced by the value
  match?: RegExp; // optional: validate/transform the field value
  split?: string | RegExp; // optional: one badge per value of a list field
  className?: string; // CSS class(es) for the <a> element
}
```

#### Presets

`badgePresets` has badges for `doi`, `arxiv`, `mrnumber` and `zbl`, with
matchers for the spellings found in real exports (`doi:10…`,
`https://doi.org/10…`, `arXiv:2301.00001v2`, `MR1234567`, `Zbl 1234.56789`).
Spread one to change it:

```ts
badges: [{ ...badgePresets.doi, className: "badge" }, badgePresets.arxiv]
```

#### Fields and eprints

A field named like an eprint archive also reads biblatex's `eprint` when
`eprinttype` or `archivePrefix` names that archive. `arxiv` therefore finds
`eprint = {2301.00001}, eprinttype = {arxiv}`, as written by biblatex, JabRef,
Zotero and arXiv itself; the same holds for any archive:

```ts
{ field: "hal", label: "HAL", url: "https://hal.science/$1" }
// eprint = {hal-01234567}, eprinttype = {hal} → https://hal.science/hal-01234567
```

An explicit field (`arxiv = {…}`) wins over `eprint`.

The `url` template uses `$1` as a placeholder for the field value:

```ts
{ field: "doi", label: "doi", url: "https://doi.org/$1" }
// doi: "10.1234/example" → href="https://doi.org/10.1234/example"
```

When `match` is provided, the field value is tested against the regex. If it doesn't match, the badge is skipped. If it matches, `$1` in the URL is replaced by the **first capture group** (or the full match if there are no capture groups):

```ts
// Strip version suffix from arXiv IDs:
{ field: "arxiv", label: "arXiv",
  url: "https://arxiv.org/abs/$1",
  match: /^(.+?)(?:v\d+)?$/ }
// "2301.00001v3" → capture group "2301.00001" → href=".../2301.00001"

// Only link if the field looks like a valid identifier:
{ field: "zbl", label: "zbMATH",
  url: "https://zbmath.org/?q=an:$1",
  match: /^(\d+\.\d+)$/ }
// "7654.12345" → match → linked
// "not-a-number" → no match → badge skipped
```

`label` and `url` may be functions of the matched value and the entry, for
anything a template can't express:

```ts
// Link each publication to its project page, e.g. project = {Alpha}:
{ field: "project", label: (code) => code,
  url: (code) => `/projects/${code.toLowerCase()}/` }
```

A field holding a list becomes one badge per value with `split`; `match`,
`label` and `url` then apply to each value:

```ts
// project = {Alpha, Beta} → two badges, in that order
{ field: "project", split: ",", label: (code) => code,
  url: (code) => `/projects/${code.toLowerCase()}/`, className: "project" }
```

Badge labels are HTML-escaped before rendering. Badge links are emitted for
`http(s)`, `mailto:` and relative URLs (`/…`, `./…`, `../…`, `#…`, `?…`); any
other scheme drops the badge.

### Links as data: `bib.links(entry, options?)`

The links an entry gets, resolved exactly as for the HTML: its title link and
its badges, each with `field`, the matched `value`, `url` and `label`. To lay the
badges out yourself, format with `appendBadges: false`: they are left out of the
HTML but still withheld from the style.

```ts
const { badges } = bib.links(entry);
const html = bib.formatEntry(entry, { appendBadges: false });
const arxiv = badges.find((link) => link.field === "arxiv")?.value; // "2301.00001"
```

### `linkAttributes`

Called for every link the library writes (the title link, badges, the fallback
URL) with `{ kind, field, value, url, label, className, entry }`. The returned
attributes are added; a `class` is added to the badge's own, and an `href`
replaces the URL (checked like any other).

```ts
linkAttributes: (link) => ({
  class: link.kind === "title" ? "bib-title" : `badge-${link.field}`,
  ...(link.url.startsWith("/") ? { href: base + link.url.slice(1) } : { target: "_blank", rel: "noopener" }),
})
```

### `wrapVariable`

Wraps the rendered HTML of each CSL variable of a bibliography entry, e.g. to
mark it for CSS:

```ts
wrapVariable: (html, { variable }) => `<span data-csl-variable="${variable}">${html}</span>`
```

With a style that puts lines into `display="block"` parts, a line is then found
by what it contains, wherever the style puts it and whichever lines are missing:
`.csl-block:has([data-csl-variable="title"])`. `variable` is the name the style
uses: for `<names variable="composer"><substitute><names variable="author"/>…`
(as in APA) the authors are reported as `composer`, so write your own style when
you need exact names. The title link sits inside the title's wrapper.

This goes through citeproc's own `variableWrapper` hook, which is why the
library creates its citeproc engines itself (with citation-js's styles, locales
and data preparation, and with output identical to `cite.format()`).

### Output markup

```html
<ol reversed class="csl-bib-body">
  <li data-csl-entry-id="doe:2024" class="csl-entry">
    …formatted entry, title wrapped in <a href="…">…</a>…
    <span class="bib-links"><a class="…" href="…">DOI</a> …</span>
  </li>
</ol>
```

| Markup | Set by |
|---|---|
| `ol`/`ul`/`div`, class `csl-bib-body` | `list`; `listAttributes` adds attributes, and a `class` is added to `csl-bib-body` |
| `li` (or `div`), class `csl-entry`, `data-csl-entry-id` | `itemAttributes(entry)` adds attributes; a `class` is added to `csl-entry` |
| `span.bib-links` around the badges | `badgeListClassName` |
| `a` of a badge | `className` of the badge |
| inside the entry | the CSL style, e.g. `<i>`, `<b>`, `div.csl-block` for `display="block"`, and `div.csl-left-margin`/`div.csl-right-inline` for numbered styles; `wrapVariable` adds whatever it returns |

Numbering, and year suffixes such as 2024a/2024b, are computed within one
`formatHtml` call. Render each list you number with a single call.

#### Laying out entries yourself

For a page that shows each entry as separate lines (authors, title, details), let
the style produce the lines with `display="block"` and style them in CSS; don't
cut the HTML apart. Two things keep such a style robust:

- Mark variables with `wrapVariable` and find a line by what it contains,
  `.csl-block:has([data-csl-variable="title"])`: a missing line (no authors,
  no journal) otherwise shifts the positions.
- End each `<choose>` with a branch for everything else: a layout that only
  covers the entry types you have today silently drops the details of the
  next `@software` or `@techreport`.

Take the badges from `bib.links(entry)` with `appendBadges: false` to put them
wherever the design wants them.

### `linkifyBareUrls(html)`

Standalone utility: auto-linkify bare `http(s)://` URLs in HTML text nodes that aren't already inside `<a>`, `<script>`, or `<style>` tags. Trailing punctuation is kept outside the link.

```ts
import { linkifyBareUrls } from "@behackl/citation-js-extras";

linkifyBareUrls("See https://example.com.");
// → 'See <a href="https://example.com">https://example.com</a>.'
```

## Custom CSL styles

Pass a file path or raw XML to `cslStyle`. You can also pass the name of any template already registered with citation-js:

```ts
const bib = new Bibliography({
  data: bibtex,
  cslStyle: "./styles/my-department.csl",
  customFields: ["publication-status"],
});
```

The style is registered with citation-js and used for all formatting calls.
Locales work the same way: `lang` picks one of citation-js's registered locales.

Raw CSL XML styles are internally registered under deterministic content-hash names to avoid collisions between multiple `Bibliography` instances.

## How it works

citation-js has a hardcoded list of ~106 BibTeX → CSL field mappings. Any field not in that list is silently dropped. There is no plugin API to extend this mapping.

This package works around the limitation with a **two-pass parse**:

1. `Cite.plugins.input.chainLink(bibData)` — returns raw BibTeX entries with **all** fields preserved (but no CSL conversion).
2. `new Cite(bibData)` — returns CSL-JSON entries (needed for formatted output via citeproc) but with custom fields stripped.

The results are merged by citation key, giving you CSL-formatted output **and** access to every custom BibTeX field.

For formatting, the library runs citeproc — the engine behind citation-js — with
citation-js's styles, locales and data preparation. It creates the engine itself
because citeproc only accepts a `variableWrapper` when the engine is created, and
that hook is how title links, URL linking and `wrapVariable` reach into the
output without searching the rendered HTML. Without decoration, the output is
identical to `cite.format("bibliography")`; the test suite checks this.

## Upgrading from 0.2

- Identifiers that are linked (title link, badges) are no longer printed by the
  style as well. Set `printLinkedIdentifiers: true` for the previous output.
- Titles are linked while citeproc renders them, which is exact whatever the
  style does to the title. The link now sits outside the style's formatting of
  the title (`<a><i>Title</i></a>` rather than `<i><a>Title</a></i>`, and
  quotes the style adds are inside the link). A title the style doesn't print
  gets its URL appended instead of losing the link.
- Bare URLs are linkified per variable, no longer in text the style adds.
- A DOI the style prints is reduced to the bare DOI.
- `citeproc` is now a direct dependency, in the range citation-js uses.
- Duplicate citation keys throw instead of mixing up fields.
- `customFields` and badge fields match case-insensitively.
- Badge and title links may be relative URLs.
- The manual placeholder recipe for sanitizing can be replaced by `sanitize`.

## License

MIT
