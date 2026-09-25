# @behackl/citation-js-extras

![NPM Version](https://img.shields.io/npm/v/%40behackl%2Fcitation-js-extras)

Turn a BibTeX file into an HTML publication list with
[citation-js](https://citation.js.org/): any CSL style, titles linked to the
paper, badges for DOI, arXiv, MathSciNet and zbMATH, and mathematics in titles.

- **Every BibTeX field stays available.** citation-js drops fields it doesn't
  know (`status`, `project`, `mrnumber`, …); here they stay on each entry, for
  grouping, filtering and links.
- **Links, printed once.** The title links to the paper and identifiers become
  badges. The style doesn't print a linked DOI or URL a second time as text.
- **Exports work as they are.** `doi:10…` and `https://doi.org/10…`, arXiv ids
  in biblatex's `eprint` field, titles with quotes, `\emph` or `&`.
- **Mathematics.** `$…$` in titles survives the formatting and is typeset by
  the renderer you pass in, such as KaTeX or MathJax.
- **Your layout.** The markup is configurable; links are available as data;
  hooks reach into the formatted citation.

## Install

```bash
npm install @behackl/citation-js-extras citation-js
```

`citation-js` is a peer dependency.

## Quick start

```bibtex
@article{lindqvist2025,
  author  = {Lindqvist, Maja and Sato, Ren},
  title   = {Sobolev estimates for $L^p$ averages},
  journal = {Annals of Invented Analysis},
  volume  = {12},
  pages   = {1--44},
  year    = {2025},
  doi     = {10.5555/aia.2025.12},
  eprint  = {2501.01234},
  eprinttype = {arxiv},
  status  = {published},
}
```

```ts
import { Bibliography, badgePresets } from "@behackl/citation-js-extras";

const bib = new Bibliography({
  data: "./publications.bib",        // a file path or BibTeX text
  cslStyle: "apa",                   // a built-in style, a .csl file, or CSL XML
  customFields: ["status"],          // non-standard fields to keep on `entry.custom`
  badges: [badgePresets.doi, badgePresets.arxiv],
});

const published = bib.sort(bib.filter({ status: "published" }), { by: "date" });
const html = bib.formatHtml(published);
```

```html
<ol reversed class="csl-bib-body">
<li data-csl-entry-id="lindqvist2025" class="csl-entry">Lindqvist, M., &#38; Sato, R. (2025).
  <a href="https://doi.org/10.5555/aia.2025.12">Sobolev estimates for $L^p$ averages</a>.
  <i>Annals of Invented Analysis</i>, <i>12</i>, 1–44.
  <span class="bib-links"><a href="https://doi.org/10.5555/aia.2025.12">DOI</a> <a href="https://arxiv.org/abs/2501.01234">arXiv</a></span></li>
</ol>
```

Line breaks added for readability. APA would normally print the DOI after the
journal; here it is linked as the title link and as a badge instead.

## Mathematics

With `preserveMath`, formulas in titles reach your renderer intact:

```ts
import katex from "katex";

const bib = new Bibliography({ data: "./publications.bib", preserveMath: true });
const html = bib.formatHtml(bib.entries, {
  renderMath: (tex, { display }) => katex.renderToString(tex, { displayMode: display }),
  sanitize: (html) => mySanitizer(html), // optional; runs before the math is inserted
});
```

See [Mathematics and sanitizing](docs/math.md).

## Customising

| To change | Use | Details |
|---|---|---|
| which fields you can read | `customFields`; `entry.raw` has every field | [API](docs/api.md#new-bibliographyoptions) |
| which links follow an entry | `badges`: presets, `$1` templates, or functions | [Links and badges](docs/links.md#badges) |
| where the title links to | `titleLink` | [Links and badges](docs/links.md#title-links) |
| attributes of the links (class, `target`, a base path) | `linkAttributes` | [Links and badges](docs/links.md#link-attributes) |
| how entries read | the CSL style (`cslStyle`) and locale (`lang`) | [Layout](docs/layout.md#styles-and-locales) |
| the markup around entries | `list`, `listAttributes`, `itemAttributes`, `badgeListClassName` | [Layout](docs/layout.md#markup) |
| a layout of your own | `links(entry)`, `appendBadges`, `wrapVariable` | [Layout](docs/layout.md#laying-out-entries-yourself) |
| what reaches the page | `sanitize`, `renderMath` | [Mathematics](docs/math.md) |
| order and selection | `sort`, `filter`, or array methods on `bib.entries` | [API](docs/api.md#bibsortentries-options) |

Formatting options can be given to the constructor as defaults, or to each
`formatHtml`/`formatEntry` call.

## Documentation

- [API reference](docs/api.md)
- [Links and badges](docs/links.md)
- [Mathematics and sanitizing](docs/math.md)
- [Layout: markup, styles, custom layouts](docs/layout.md)
- [How it works](docs/how-it-works.md)

[Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md)

## License

MIT
