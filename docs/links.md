# Links and badges

Each entry can get two kinds of link: a **title link**, around the title, and
**badges**, small links after the entry (DOI, arXiv, MR, …).

## Title links

The title links to the first of the `titleLink` fields that yields a URL:

```ts
bib.formatHtml(entries, { titleLink: ["url", "doi", "arxiv"] }); // the default
```

- `doi`, `arxiv`, `mrnumber` and `zbl` are turned into URLs by their
  [preset](#presets): `doi = {doi:10.5555/x}` links to `https://doi.org/10.5555/x`.
- Another field uses your badge for that field, if there is one.
- Otherwise the field must hold a URL: `http(s)`, `mailto`, or relative, such
  as `/files/paper.pdf`.

The link goes around the title exactly as the style prints it, with its quotes,
italics or capitalisation, including a title that stands in for missing
authors. A style that prints no title gets the URL appended to the entry.

## Badges

```ts
const bib = new Bibliography({
  data: "./publications.bib",
  badges: [
    { field: "doi", label: "DOI", url: "https://doi.org/$1" },
    { field: "zbl", label: "zbMATH", url: "https://zbmath.org/?q=an:$1", match: /^(\d+\.\d+)$/ },
  ],
});
```

An entry gets a badge for each configured field it has. In `url`, `$1` stands
for the value. With `match`, the badge only appears if the value matches, and
`$1` is the first capture group:

```ts
{ field: "arxiv", label: "arXiv", url: "https://arxiv.org/abs/$1", match: /^(.+?)(?:v\d+)?$/ }
// arxiv = {2301.00001v3}  →  https://arxiv.org/abs/2301.00001
```

`label` and `url` can also be functions of the matched value and the entry,
for anything a template can't express:

```ts
{ field: "project", label: (code) => code, url: (code) => `/projects/${code.toLowerCase()}/` }
// project = {Alpha}  →  <a href="/projects/alpha/">Alpha</a>
```

A field that holds a list becomes one badge per value with `split`:

```ts
{ field: "project", split: ",", label: (code) => code, url: (code) => `/projects/${code.toLowerCase()}/` }
// project = {Alpha, Beta}  →  two badges
```

Labels are HTML-escaped. URLs must be `http(s)`, `mailto` or relative;
anything else, such as `javascript:`, drops the badge.

### Presets

`badgePresets` contains badges for `doi`, `arxiv`, `mrnumber` (MathSciNet) and
`zbl` (zbMATH). They accept the spellings found in real exports: `doi:10…`,
`https://doi.org/10…`, `http://dx.doi.org/10…`, `arXiv:2301.00001v2`,
`MR1234567`, `Zbl 1234.56789`.

```ts
badges: [badgePresets.doi, badgePresets.arxiv, badgePresets.mrnumber, badgePresets.zbl]
```

Spread a preset to change it: `{ ...badgePresets.doi, className: "badge" }`.

### Eprint fields

biblatex, JabRef, Zotero and arXiv's own export write arXiv ids as
`eprint = {2301.00001}, eprinttype = {arxiv}` (or `archivePrefix = {arXiv}`).
A field named after an eprint archive reads these: the `arxiv` badge and title
link find the id without an `arxiv` field. The same works for any archive:

```ts
{ field: "hal", label: "HAL", url: "https://hal.science/$1" }
// eprint = {hal-01234567}, eprinttype = {hal}  →  https://hal.science/hal-01234567
```

## Identifiers are printed once

Most styles print the DOI and the URL. Once they are links, the style doesn't
also print them as text: the field used for the title link and the field of
every badge are left out of what the style sees. `printLinkedIdentifiers: true`
lets the style print them anyway.

A DOI the style does print is reduced to the bare DOI, so `doi = {doi:10…}`
comes out as `https://doi.org/10…`, not as `https://doi.org/doi:10…`.

Bare URLs the style prints, for example in a `note`, become links unless
`linkifyUrls: false`.

## Link attributes

`linkAttributes` is called for every link the library writes (the title link,
badges, and a title URL appended as fallback) and returns attributes for it:

```ts
const base = "/my-site/";

bib.formatHtml(entries, {
  linkAttributes: (link) => ({
    class: link.kind === "title" ? "bib-title" : `badge badge-${link.field}`,
    // Relative URLs get the site's base path; external links open in a new tab.
    ...(link.url.startsWith("/")
      ? { href: base + link.url.slice(1) }
      : { target: "_blank", rel: "noopener" }),
  }),
});
```

It receives the [link](api.md#biblinksentry-options): its `kind`, `field`,
matched `value`, `url`, and the entry; after checking `kind === "badge"`, also
its `label`. A `class` is added to the badge's own
`className`; an `href` replaces the URL and must itself be allowed.

To render the links yourself instead, see
[Laying out entries yourself](layout.md#laying-out-entries-yourself).
