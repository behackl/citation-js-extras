// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Declares a badge link to render alongside bibliography entries.
 *
 * The `url` is a template string where `$1` is replaced by the (optionally
 * transformed) field value.  When `match` is provided, the field value is
 * tested against it first: if it doesn't match the badge is skipped; if it
 * does, `$1` in the URL is replaced by the **first capture group** (or the
 * full match if there is no capture group).
 *
 * @example
 * // Simple prefix-style DOI badge:
 * { field: 'doi', label: 'doi', url: 'https://doi.org/$1' }
 *
 * @example
 * // Strip trailing version from arXiv identifiers:
 * { field: 'arxiv', label: 'arXiv',
 *   url: 'https://arxiv.org/abs/$1',
 *   match: /^(.+?)(?:v\d+)?$/ }
 *
 * @example
 * // Only link zbMATH entries that look like a Zbl number:
 * { field: 'zbl', label: 'zbMATH',
 *   url: 'https://zbmath.org/?q=an:$1',
 *   match: /^(\d{4}\.\d{5})$/ }
 *
 * @example
 * // Functions for what a template can't express, e.g. a site-relative link:
 * { field: 'project', label: (code) => code,
 *   url: (code) => `/projects/${code.toLowerCase()}/` }
 */
export interface BadgeConfig {
  /**
   * BibTeX field to read, case-insensitively. A field named like an eprint
   * archive (`arxiv`, `hal`, ...) also reads `eprint` when `eprinttype` or
   * `archivePrefix` names that archive.
   */
  field: string;
  /**
   * Text of the badge (HTML-escaped), or a function of the matched value and
   * the entry.
   */
  label: string | BadgeFunction;
  /**
   * URL template in which `$1` is replaced by the matched value, or a function
   * of the matched value and the entry. `http(s)`, `mailto` and relative URLs
   * (`/…`, `./…`, `../…`, `#…`, `?…`) are kept; anything else drops the badge.
   */
  url: string | BadgeFunction;
  /**
   * Optional regex applied to the field value.
   *
   * - If it **doesn't match**, the badge is skipped for that entry.
   * - If it **matches**, `$1` in the URL is replaced by the first capture
   *   group (or the full match when there are no capture groups).
   */
  match?: RegExp;
  /**
   * Split the field into several values, each rendered as its own badge, e.g.
   * `project = {Alpha, Beta}` with `split: ","`. Values are trimmed and
   * empty ones skipped; `match`, `label` and `url` apply to each value.
   */
  split?: string | RegExp;
  /** CSS class name(s) for the badge `<a>` element. */
  className?: string;
}

/** Computes a badge's label or URL from the matched field value. */
export type BadgeFunction = (value: string, entry: BibEntry) => string;

/** HTML attributes; `true` renders a valueless attribute, `false` omits it. */
export type HtmlAttributes = Record<string, string | boolean>;

/** A link the library resolved for an entry: its title link or a badge. */
export interface Link {
  kind: "title" | "badge";
  /** The field the link was built from, as configured (`doi`, `url`, ...). */
  field: string;
  /** The matched value: `10.1000/x` for a DOI, one part of a `split` field. */
  value: string;
  url: string;
  /** Badge text; absent for the title link. */
  label?: string;
  /** The badge's configured `className`, if any. */
  className?: string;
  entry: BibEntry;
}

/** The links of one entry: its title link and badges. */
export interface EntryLinks {
  title?: Link;
  badges: Link[];
}

/** Synchronous renderer returning trusted HTML. Sanitize untrusted renderer output. */
export type MathRenderer = (tex: string, context: { display: boolean }) => string;

/**
 * Options passed to {@link Bibliography.formatHtml} or
 * {@link Bibliography.formatEntry}. `list` and `listAttributes` only apply to
 * `formatHtml`, which is the only method emitting a wrapper element.
 */
export interface FormatOptions {
  /** Render protected math as trusted HTML; requires preserveMath at construction.
   * Without this callback, escaped original TeX delimiters are restored.
   * Not settable on the constructor.
   */
  renderMath?: MathRenderer;

  /**
   * Fields to use for linking the title, checked in order; the first that
   * yields a URL wins. A field with a {@link badgePresets} entry (`doi`,
   * `arxiv`, ...) is expanded by that preset; another field with a configured
   * badge by that badge; any other field must hold a URL itself.
   * Overrides the constructor default, if any.
   *
   * @default ['url', 'doi', 'arxiv']
   */
  titleLink?: string[];

  /**
   * Badge configurations to append to each entry.
   * Overrides the constructor default, if any.
   *
   * @default [] (no badges)
   */
  badges?: BadgeConfig[];

  /**
   * Wrapper list element.
   * @default 'ol'
   */
  list?: "ol" | "ul" | "div";

  /**
   * HTML attributes for the wrapper element (e.g. `{ reversed: true }`).
   * Boolean `true` renders as a valueless attribute. A `class` is added to
   * `csl-bib-body`.
   *
   * @default { reversed: true }  (when list is 'ol')
   */
  listAttributes?: HtmlAttributes;

  /**
   * Also let the CSL style print identifiers that are already linked. By
   * default, the field used for the title link and the field of every rendered
   * badge are withheld from the style, so a DOI or URL is not printed again
   * as text next to its link.
   *
   * @default false
   */
  printLinkedIdentifiers?: boolean;

  /**
   * Turn bare `http(s)://` URLs that the style prints (e.g. in a `note`) into
   * links. Applied to each variable as citeproc renders it, never to text the
   * style adds around variables. Overrides the constructor default, if any.
   *
   * @default true
   */
  linkifyUrls?: boolean;
}

/** A bibliography entry enriched with custom BibTeX fields. */
export interface BibEntry {
  /** The CSL-JSON object used by citation-js for formatting. */
  csl: Record<string, any>;
  /** The BibTeX citation key. */
  key: string;
  /** Publication year (extracted from CSL `issued`). */
  year: number | null;
  /**
   * Custom BibTeX fields that were requested via `customFields`.
   * Only fields that are present on the entry appear here.
   */
  custom: Record<string, string>;
  /** The full raw BibTeX properties (unfiltered). */
  raw: Record<string, any>;
}

/**
 * Formatting options that can be set once on the constructor and overridden
 * by the options of an individual `formatHtml`/`formatEntry` call.
 */
export type FormatDefaults = Pick<
  FormatOptions, "titleLink" | "badges" | "linkifyUrls" | "printLinkedIdentifiers"
>;

/** Options for constructing a {@link Bibliography}. */
export interface BibliographyOptions extends FormatDefaults {
  /** Preserve math in supported display-text fields before CSL conversion.
   * Opt-in; entries' CSL text contains internal placeholders until HTML formatting.
   * Raw/custom fields remain unchanged. Unclosed or empty math throws.
   */
  preserveMath?: boolean;

  /**
   * BibTeX input — either a raw BibTeX string or a file path.
   * When a file path is given, it is read synchronously at construction time.
   */
  data: string;

  /**
   * CSL style — a built-in template name (e.g. `'apa'`), raw CSL XML, or a
   * file path to a `.csl` file.  When a file path is given, it is read
   * synchronously.
   *
   * When raw XML is provided, it is registered under an internal
   * deterministic name (based on content hash) and used automatically by
   * {@link Bibliography.formatHtml} and {@link Bibliography.formatEntry}.
   *
   * @default 'apa'
   */
  cslStyle?: string;

  /**
   * BibTeX field names to preserve through the citation-js pipeline.
   * These are extracted from the raw BibTeX parse and made available on
   * each {@link BibEntry} under `.custom`, keyed as given here. Matching is
   * case-insensitive, like BibTeX: `archivePrefix` finds `archiveprefix`.
   *
   * Common examples: `['publication-status', 'arxiv', 'mrnumber', 'project']`.
   */
  customFields?: string[];
}
