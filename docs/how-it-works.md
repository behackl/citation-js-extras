# How it works

## Keeping every field

citation-js converts BibTeX to CSL-JSON through a fixed mapping of about a
hundred fields and drops everything else. The library therefore parses twice:

1. `Cite.plugins.input.chainLink(bibtex)` returns the raw BibTeX entries with
   **all** fields (`entry.raw`, and `entry.custom` for the fields you declare).
2. `new Cite(bibtex)` returns the CSL-JSON that styles are applied to
   (`entry.csl`).

The two are joined by citation key, which is why duplicate keys are an error.

With `preserveMath`, formulas in the raw text fields are replaced by
placeholders before the conversion, and restored after formatting.

## Formatting

Formatting runs citeproc, the engine behind citation-js, with citation-js's
styles, locales and data preparation. The library creates the engine itself
rather than calling `cite.format()`, because citeproc only accepts a
`variableWrapper` when the engine is created. That hook is called for every
variable citeproc renders, and it is how the title link, URL linking and
`wrapVariable` reach into the citation: exactly around what the style prints,
without searching the finished HTML.

Without links, badges or wrappers, the output is identical to
`cite.format("bibliography")`; the test suite checks this for several styles.
Engines are cached per style and locale, as in citation-js.

For each call:

1. The links of every entry are resolved (title link and badges).
2. The fields those links use are removed from the CSL data the style sees, so
   it doesn't print them again.
3. citeproc renders all entries in one pass; the wrapper links the title.
4. Badges are appended, the list is assembled, `sanitize` runs, and rendered
   math replaces the placeholders.
