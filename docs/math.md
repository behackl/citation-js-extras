# Mathematics and sanitizing

## Formulas in titles

citation-js turns TeX into plain text. With `preserveMath`, formulas are kept
intact through the formatting instead:

```ts
const bib = new Bibliography({ data: "./publications.bib", preserveMath: true });
```

Then either typeset them while formatting, with a synchronous renderer of your
choice that returns HTML:

```ts
import katex from "katex";

const html = bib.formatHtml(bib.entries, {
  renderMath: (tex, { display }) => katex.renderToString(tex, { displayMode: display }),
});
```

or leave out `renderMath`: the original TeX is written back, HTML-escaped, for
MathJax or KaTeX in the browser.

- Delimiters: `$…$`, `$$…$$`, `\(…\)` and `\[…\]`. Write a literal dollar as `\$`.
- Fields: titles, subtitles, book and journal titles, `note`, `annote`,
  `abstract` and `howpublished`, as far as the style prints them. Names,
  identifiers, URLs and custom fields are left as they are.
- `@string` definitions, concatenations and crossref-inherited titles work.
- An empty or unclosed formula makes the constructor throw, naming the entry and
  field. If `renderMath` throws, the error names the entry the formula came from.

The library only finds the formulas; whether the TeX is valid is up to your renderer.

## Sanitizing

A sanitizer removes the markup KaTeX and MathJax need (`class`, `style`,
MathML), which leaves empty boxes. Pass the sanitizer as `sanitize`: it runs on
the finished HTML while formulas are still placeholders, and the rendered math
is inserted afterwards.

```ts
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";

const sanitizer = unified()
  .use(rehypeParse, { fragment: true })
  .use(rehypeSanitize, schema)
  .use(rehypeStringify);

const html = bib.formatHtml(bib.entries, {
  renderMath: (tex, { display }) => katex.renderToString(tex, { displayMode: display }),
  sanitize: (html) => String(sanitizer.processSync(html)),
});
```

Your schema has to allow the classes and attributes the library writes. See
[Markup](layout.md#markup) for the list.

Rendered math is inserted after sanitizing, so it is exactly as safe as your
renderer. KaTeX with its default `trust: false` is safe; a renderer allowed to emit
arbitrary HTML is not.

### Formatting the style writes

Most formatting is `<i>`, `<b>`, `<sup>` and `<sub>`. For the rest citeproc
writes a `<span>` with one of a few fixed `style` values: small caps,
underlining, and switching back to upright, normal weight or no underline.
Switching back to upright is common: `\emph{…}` in a title the style sets in
italics comes out as `<span style="font-style:normal;">…</span>`. A sanitizer
that drops `style` loses that formatting silently.

These values are safe to allow exactly, without allowing `style` in general.
With `rehype-sanitize`:

```ts
import { defaultSchema } from "rehype-sanitize";

const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    span: [["style",
      "font-style:normal;", "font-variant:small-caps;", "font-variant:normal;",
      "font-weight:normal;", "text-decoration:none;", "text-decoration:underline;",
    ]],
  },
};
```

citeproc also writes `style="baseline"` for `vertical-align="baseline"`; it is
not valid CSS, so dropping it changes nothing.
