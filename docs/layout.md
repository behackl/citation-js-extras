# Layout: markup, styles, custom layouts

## Markup

```html
<ol reversed class="csl-bib-body">
<li data-csl-entry-id="lindqvist2025" class="csl-entry">
  … the formatted entry, with the title in <a href="…">…</a> …
  <span class="bib-links"><a href="…">DOI</a> <a href="…">arXiv</a></span>
</li>
</ol>
```

| Markup | Change it with |
|---|---|
| `ol`/`ul`/`div` with class `csl-bib-body` | `list`, `listAttributes` |
| `li` (or `div`) with class `csl-entry` and `data-csl-entry-id` | `itemAttributes: (entry) => ({ id: "pub-" + entry.key })` |
| `span.bib-links` around the badges | `badgeListClassName`, or `appendBadges: false` |
| the `a` elements | a badge's `className`; `linkAttributes` for all links |
| everything inside the entry | the CSL style: `<i>`, `<b>`, `<span style>` for [other formatting](math.md#formatting-the-style-writes), `div.csl-block` for `display="block"`, `div.csl-left-margin`/`div.csl-right-inline` in numbered styles; plus whatever `wrapVariable` adds |

Classes you give are added to the library's own. A [sanitizer](math.md#sanitizing)
must allow these classes, `data-csl-entry-id`, and any attributes you add. With
`rehype-sanitize`, allowed classes are listed per tag (a list under `'*'` doesn't
apply to tags that have their own), and class names you compute, e.g. one per
project, need a pattern rather than a list.

Numbering and year suffixes (2024a, 2024b) are computed per `formatHtml` call:
format each numbered list with one call.

## Styles and locales

`cslStyle` takes a style registered with citation-js (`apa`, `vancouver`,
`harvard1`), a path to a `.csl` file, or CSL XML. Styles from the
[Zotero style repository](https://www.zotero.org/styles) work as they are.

`lang` sets the locale of the style's terms and dates: `en-US` (the default),
`de-DE`, `fr-FR`, `es-ES` or `nl-NL`. Further locales can be registered with
citation-js:

```ts
import Cite from "citation-js";
Cite.plugins.config.get("@csl").locales.add("it-IT", localeXml);
```

## Laying out entries yourself

For a page where each entry is several lines (authors, title, details) and the
links sit in a row of their own, let the style produce the lines and take the
links as data. Parsing the HTML is never necessary.

**The lines.** In your CSL style, give each line `display="block"`:

```xml
<bibliography>
  <layout>
    <names variable="author" display="block" font-weight="bold"/>
    <text variable="title" display="block"/>
    <text macro="details" display="block" font-style="italic"/>
  </layout>
</bibliography>
```

Each line becomes a `div.csl-block`. Line breaks and indentation between them
come from citeproc and are harmless.

- A line that is empty for an entry (no authors, no journal) is left out, so
  don't style lines by position. Mark the variables with `wrapVariable` and
  find a line by what it contains:

  ```ts
  wrapVariable: (html, { variable }) => `<span data-csl-variable="${variable}">${html}</span>`
  ```
  ```css
  .csl-block:has([data-csl-variable="title"]) { font-size: 1.1em; }
  ```

  `variable` is the name the style uses. In a `<names>` element with
  `<substitute>`, that is the element's own variable, whichever one was printed.
- End every `<choose>` with an `<else>` that prints what is left, so that an
  entry type you didn't plan for, such as `@software`, still shows its details.

**The links.** Format without badges and take them from `links()`:

```ts
const citations = entries.map((entry) => ({
  html: bib.formatEntry(entry, { appendBadges: false }),
  links: bib.links(entry).badges, // [{ field, value, url, label, … }]
}));
```

Linked identifiers are still left out of the text, and the title is still
linked. In your template, render `links` however the design wants, for example
the arXiv id as "Archived at: arxiv:2501.01234" from its `value`, or project
badges as router links.

## Copying an entry's BibTeX

`bib.bibtex(entry)` returns the entry as BibTeX that a reader can paste into
their own `.bib` file: the original key and TeX, with `@string` abbreviations
resolved and the fields of a `crossref` parent filled in. If the parent is
missing (keys are case-sensitive), the unresolved `crossref` stays, so the copy
may still require its parent. Leave out the fields that are only for your page:

```ts
bib.bibtex(entry, { exclude: ["status", "project", "file"] });
```

**With `formatHtml`**, put it on each item, and add the buttons in the browser:

```ts
const html = bib.formatHtml(entries, {
  itemAttributes: (entry) => ({ "data-bibtex": bib.bibtex(entry, { exclude: ["status"] }) }),
});
```

```html
<script type="module">
  // The clipboard is only available on https:// pages and on localhost.
  if (navigator.clipboard) {
    for (const item of document.querySelectorAll("[data-bibtex]")) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Copy BibTeX";
      button.addEventListener("click", () => {
        navigator.clipboard.writeText(item.dataset.bibtex).then(
          () => { button.textContent = "Copied"; },
          () => { button.textContent = "Copy failed"; },
        );
      });
      item.append(button);
    }
  }
</script>
```

A [sanitizer](math.md#sanitizing) must allow the attribute. With
`rehype-sanitize`, add it to those of `li`:
`li: [...(defaultSchema.attributes?.li ?? []), "dataBibtex"]`.

**In your own layout**, pass it on with the entry's `html` and `links` from
above, and render it as text: in a `<pre>`, or behind a button that calls
`navigator.clipboard.writeText`.
