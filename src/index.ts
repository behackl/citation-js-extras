import { existsSync, readFileSync, statSync } from "node:fs";
import Cite from "citation-js";
import CSL from "citeproc";
import { MathProtector } from "./math.js";
import type {
  BadgeConfig,
  BibEntry,
  BibliographyOptions,
  FormatDefaults,
  FormatOptions,
  HtmlAttributes,
} from "./types.js";

export type {
  BadgeConfig,
  BibEntry,
  BibliographyOptions,
  FormatDefaults,
  FormatOptions,
  HtmlAttributes,
  MathRenderer,
} from "./types.js";

type Engine = InstanceType<typeof CSL.Engine>;

/**
 * The render call in progress. Engines are shared between instances (creating
 * one compiles the style, which is slow), so their callbacks look up whoever is
 * rendering right now. Rendering is synchronous, which makes this safe.
 */
let current: {
  items: Map<string, Record<string, any>>;
  wrap: (params: any, pre: string, str: string, post: string) => string;
} | undefined;

/** Engines by style and locale, like citation-js's own cache. */
const engines = new Map<string, Engine>();
const busy = new Set<Engine>();

function createEngine(templateName: string, lang: string): Engine {
  const { templates, locales } = Cite.plugins.config.get("@csl");
  const engine = new CSL.Engine({
    retrieveItem: (id) => {
      const item = current?.items.get(id);
      if (!item) throw new Error(`Cannot find entry with id '${id}'`);
      return item;
    },
    retrieveLocale: (locale) => locales.get(locale) ?? locales.get(locale.replace("-", "_")) ?? {},
    variableWrapper: (params, pre, str, post) => current ? current.wrap(params, pre, str, post) : pre + str + post,
  }, templates.get(templateName), locales.has(lang) ? lang : undefined, true);
  // As citation-js: DOIs and URLs are linked by us, not by citeproc.
  engine.opt.development_extensions.wrap_url_and_doi = false;
  return engine;
}

/** What the variable wrapper needs while citeproc renders one call's entries. */
interface Rendering {
  options: FormatOptions;
  byId: Map<string, { entry: BibEntry; titleUrl: string | null; titleLinked: boolean }>;
}

// ---------------------------------------------------------------------------
// Bibliography class
// ---------------------------------------------------------------------------

export class Bibliography {
  /** The CSL template name to use for formatting. */
  readonly templateName: string;

  /** All parsed entries. */
  readonly entries: BibEntry[];

  private readonly customFieldNames: string[];
  private readonly math?: MathProtector;
  /** Formatting defaults from the constructor; each call may override them. */
  private readonly formatDefaults: FormatDefaults;
  private rendering?: Rendering;

  constructor(options: BibliographyOptions) {
    const bibData = maybeReadFile(options.data);
    this.customFieldNames = options.customFields ?? [];
    this.formatDefaults = {
      titleLink: options.titleLink,
      badges: options.badges,
      linkifyUrls: options.linkifyUrls,
    };

    // Register CSL style
    this.templateName = this.registerStyle(options.cslStyle);

    // Two-pass parse: raw (preserves all fields) + CSL (for formatting)
    const { plugins } = Cite;
    const rawEntries: { type: string; label: string; properties: Record<string, any> }[] =
      plugins.input.chainLink(bibData);
    const rawMap = new Map<string, Record<string, any>>();
    const duplicates = new Set<string>();
    for (const entry of rawEntries) {
      if (rawMap.has(entry.label)) duplicates.add(entry.label);
      rawMap.set(entry.label, entry.properties);
    }
    // Raw fields are merged by key, so a duplicate would silently give one
    // entry the other's fields.
    if (duplicates.size) {
      throw new Error(`Duplicate citation key${duplicates.size > 1 ? "s" : ""}: ${[...duplicates].join(", ")}`);
    }

    // Protect resolved raw fields, after BibTeX strings/concatenations are parsed
    // but before the lossy TeX-to-CSL conversion. Keep the original raw map intact.
    this.math = options.preserveMath
      ? new MathProtector(JSON.stringify(rawEntries)) : undefined;
    const cite = this.math
      ? new Cite(rawEntries.map(entry => ({
          ...entry, properties: this.math!.protect(entry.properties, entry.label),
        })))
      : new Cite(bibData);
    this.entries = (cite.data as Record<string, any>[]).map(
      (csl): BibEntry => {
        const key = String(csl["citation-key"] || csl.id);
        const raw = rawMap.get(key) ?? {};
        const custom: Record<string, string> = {};
        for (const f of this.customFieldNames) {
          const value = raw[f.toLowerCase()] ?? raw[f];
          if (value != null) custom[f] = String(value);
        }
        return {
          csl,
          key,
          year: csl.issued?.["date-parts"]?.[0]?.[0] ?? null,
          custom,
          raw,
        };
      },
    );
  }

  // -------------------------------------------------------------------------
  // Filtering & sorting
  // -------------------------------------------------------------------------

  /**
   * Return entries whose custom fields match **all** given key/value pairs.
   *
   * @example
   * bib.filter({ 'publication-status': 'published' })
   */
  filter(criteria: Record<string, string>): BibEntry[] {
    return this.entries.filter((e) =>
      Object.entries(criteria).every(([k, v]) => e.custom[k] === v),
    );
  }

  /**
   * Return a sorted **copy** of the given entries.
   *
   * @param entries - entries to sort (not mutated)
   * @param by - `'year'` (default) or a custom field name
   * @param order - `'desc'` (default) or `'asc'`
   */
  sort(
    entries: BibEntry[],
    { by = "year", order = "desc" }: { by?: string; order?: "asc" | "desc" } = {},
  ): BibEntry[] {
    return [...entries].sort((a, b) => {
      const va = by === "year" ? (a.year ?? 0) : (a.custom[by] ?? "");
      const vb = by === "year" ? (b.year ?? 0) : (b.custom[by] ?? "");
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return order === "desc" ? -cmp : cmp;
    });
  }

  // -------------------------------------------------------------------------
  // Formatting
  // -------------------------------------------------------------------------

  /**
   * Format a single entry as an HTML string (no wrapper element).
   * Applies title linking, badge injection and URL linkification.
   */
  formatEntry(entry: BibEntry, options: FormatOptions = {}): string {
    const merged = this.mergeOptions(options);
    const [html = ""] = this.renderItems([entry], merged);
    return this.restoreMath(html, merged, entry);
  }

  /**
   * Format a list of entries as a complete HTML bibliography.
   */
  formatHtml(entries: BibEntry[], options: FormatOptions = {}): string {
    if (entries.length === 0) return "";

    const merged = this.mergeOptions(options);
    const tag = merged.list ?? "ol";
    const attrs = merged.listAttributes ?? (tag === "ol" ? { reversed: true } : {});
    const attrStr = renderAttributes(withClass(attrs, "csl-bib-body"));
    const itemTag = tag === "div" ? "div" : "li";

    // Rendered in one citeproc run so style-dependent numbering/state
    // (e.g. vancouver left-margin labels) remains correct.
    const items = this.renderItems(entries, merged).map((inner, index) => {
      const entry = entries[index]!;
      return `<${itemTag} data-csl-entry-id="${escapeAttr(entry.key)}" class="csl-entry">${this.restoreMath(inner, merged, entry)}</${itemTag}>`;
    });

    return `<${tag}${attrStr}>\n${items.join("\n")}\n</${tag}>`;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Per-call options win over the defaults given to the constructor. */
  private mergeOptions(options: FormatOptions): FormatOptions {
    return {
      ...options,
      titleLink: options.titleLink ?? this.formatDefaults.titleLink,
      badges: options.badges ?? this.formatDefaults.badges,
      linkifyUrls: options.linkifyUrls ?? this.formatDefaults.linkifyUrls,
    };
  }

  /**
   * Restore protected math, naming the entry when a renderer rejects a formula.
   * Without the citation key, `renderMath` failures are near-impossible to
   * trace back to a line in the .bib file.
   */
  private restoreMath(html: string, options: FormatOptions, entry?: BibEntry): string {
    if (!this.math) return html;
    try {
      return this.math.restore(html, options.renderMath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(entry ? `entry ${entry.key}: ${message}` : message, { cause: error });
    }
  }

  /**
   * Entry HTML without wrapper, shared by `formatEntry` and `formatHtml` so
   * both honour the same options.
   */
  private renderItems(entries: BibEntry[], options: FormatOptions): string[] {
    const byId = new Map(entries.map(entry => [String(entry.csl.id ?? entry.key), {
      entry,
      titleUrl: typeof entry.csl.title === "string" && entry.csl.title.trim()
        ? this.resolveTitleLink(entry, options.titleLink)
        : null,
      titleLinked: false,
    }]));
    this.rendering = { options, byId };
    let rendered: Array<[string, string]>;
    try {
      rendered = this.renderCslEntries(entries.map(entry => entry.csl), "en-US");
    } finally {
      this.rendering = undefined;
    }
    const renderedMap = new Map<string, string>(rendered);

    return entries.map((entry, index) => {
      const id = String(entry.csl.id ?? entry.key);
      const raw = renderedMap.get(id) ?? rendered[index]?.[1] ?? "";
      const html = unwrapCslEntry(raw) ?? raw.trim();
      const { titleUrl, titleLinked } = byId.get(id)!;
      return this.decorate(entry, html, titleLinked ? null : titleUrl, options);
    });
  }

  /**
   * Called by citeproc for every variable it renders. Everything the library
   * adds to the citation text happens here, one variable at a time, instead of
   * by searching the finished HTML:
   *
   * - the title link, around the exact output of the title variable, so no
   *   quotes, markup or capitalisation the style applies can hide the title;
   * - bare URLs in a variable (e.g. in a `note`) become links. Formulas are
   *   still placeholders here, so MathML's xmlns URL is never linked.
   */
  private wrapVariable(params: { itemData?: Record<string, any>; variableNames?: string[]; context?: string; mode?: string },
    pre: string, str: string, post: string): string {
    const state = this.rendering;
    const item = state?.byId.get(String(params.itemData?.id));
    if (!state || !item || params.context !== "bibliography" || params.mode !== "html" || !str) {
      return pre + str + post;
    }
    const variable = params.variableNames?.[0] ?? "";
    let html = str;
    // A style may print the title in another variable's place, e.g. APA
    // substitutes it for missing authors; citeproc then doesn't call it `title`.
    const isTitle = variable === "title"
      || (typeof item.entry.csl.title === "string" && plainText(str) === plainText(item.entry.csl.title));
    if (isTitle && item.titleUrl && !item.titleLinked) {
      html = `<a href="${escapeAttr(item.titleUrl)}">${html}</a>`;
      item.titleLinked = true;
    }
    if (state.options.linkifyUrls !== false) html = linkifyBareUrls(html);
    return pre + html + post;
  }

  private registerStyle(cslStyle?: string): string {
    if (!cslStyle) return "apa";

    const config = Cite.plugins.config.get("@csl");
    const templates = config.templates;
    if (templateExists(templates, cslStyle)) {
      return cslStyle;
    }

    const xml = readFileIfExists(cslStyle) ?? (looksLikeXml(cslStyle) ? cslStyle : null);
    if (!xml) {
      throw new Error(
        `Unknown CSL style "${cslStyle}". Provide a built-in name, file path, or CSL XML.`,
      );
    }

    const name = `custom-${hashString(xml)}`;
    if (!templateExists(templates, name)) {
      templates.add(name, xml);
    }
    return name;
  }

  /**
   * Render entries with citeproc, as `cite.format("bibliography")` does, but
   * through an engine that has our variable wrapper: citeproc only accepts it
   * when the engine is created. Styles and locales come from citation-js's
   * registries, and the data is prepared the same way.
   */
  private renderCslEntries(csl: Record<string, any>[], lang: string): Array<[string, string]> {
    const data = Cite.util.downgradeCsl(csl);
    const key = `${this.templateName}|${lang}`;
    let engine = engines.get(key);
    // citeproc is not re-entrant: a consumer function that formats with the
    // same style while this engine renders gets an engine of its own.
    if (!engine || busy.has(engine)) {
      engine = createEngine(this.templateName, lang);
      if (!engines.has(key)) engines.set(key, engine);
    }

    const previous = current;
    current = {
      items: new Map(data.map(item => [String(item.id), item])),
      wrap: (params, pre, str, post) => this.wrapVariable(params, pre, str, post),
    };
    busy.add(engine);
    try {
      engine.updateItems([]);
      const ids = engine.updateItems(data.map(item => String(item.id)), true);
      const bibliography = engine.makeBibliography();
      if (!bibliography) return [];
      return bibliography[1].map((html, index) => [String(ids[index]), html]);
    } finally {
      busy.delete(engine);
      current = previous;
    }
  }

  /** The fallback title link and the badges; the title link itself is added by citeproc's wrapper. */
  private decorate(entry: BibEntry, html: string, fallbackUrl: string | null, options: FormatOptions): string {
    let out = html;
    // Never lose a link: a style that doesn't print the title gets its URL.
    if (fallbackUrl) out += ` <a href="${escapeAttr(fallbackUrl)}">${escapeHtml(fallbackUrl)}</a>`;
    const badgeHtml = this.renderBadges(entry, options.badges ?? []);
    if (badgeHtml) out += ` ${badgeHtml}`;
    return out;
  }

  private resolveTitleLink(
    entry: BibEntry,
    fields?: string[],
  ): string | null {
    const order = fields ?? ["url", "doi", "arxiv"];
    for (const field of order) {
      const value = entry.raw[field] ?? entry.csl[field.toUpperCase()] ?? entry.csl[field];
      if (!value) continue;
      const raw = String(value).trim();
      if (!raw) continue;

      if (/^https?:\/\//i.test(raw) || /^mailto:/i.test(raw)) {
        return sanitizeUrl(raw);
      }

      if (field === "doi") {
        const doi = raw.replace(/^doi:\s*/i, "");
        return sanitizeUrl(`https://doi.org/${doi}`);
      }

      if (field === "arxiv") {
        return sanitizeUrl(`https://arxiv.org/abs/${raw.replace(/v\d+$/, "")}`);
      }
    }
    return null;
  }

  private renderBadges(entry: BibEntry, badges: BadgeConfig[]): string {
    const parts: string[] = [];

    for (const badge of badges) {
      const rawValue = entry.raw[badge.field] ?? entry.custom[badge.field];
      if (rawValue == null) continue;

      const strValue = String(rawValue);
      let insertValue: string;

      if (badge.match) {
        const m = strValue.match(badge.match);
        if (!m) continue;
        insertValue = m[1] ?? m[0];
      } else {
        insertValue = strValue;
      }

      const unsafeUrl = badge.url.replace(/\$1/g, insertValue);
      const safeUrl = sanitizeUrl(unsafeUrl);
      if (!safeUrl) continue;

      const cls = badge.className ? ` class="${escapeAttr(badge.className)}"` : "";
      parts.push(
        `<a${cls} href="${escapeAttr(safeUrl)}">${escapeHtml(String(badge.label))}</a>`,
      );
    }

    if (parts.length === 0) return "";
    return `<span class="bib-links">${parts.join(" ")}</span>`;
  }
}

// ---------------------------------------------------------------------------
// Standalone utilities (exported for reuse)
// ---------------------------------------------------------------------------

/**
 * Auto-linkify bare `http(s)://` URLs in HTML that aren't already inside
 * an `<a>` tag. Trailing punctuation (`.`, `,`, `;`, etc.) is kept outside
 * the link.
 */
export function linkifyBareUrls(html: string): string {
  const tokens = html.split(/(<[^>]*>)/g);
  const urlRegex = /(https?:\/\/[^\s<>"',;)]+)/g;

  let insideAnchor = false;
  let insideScript = false;
  let insideStyle = false;
  const output: string[] = [];

  for (const token of tokens) {
    if (token.startsWith("<")) {
      const lower = token.toLowerCase();
      if (/^<a\b/.test(lower)) insideAnchor = true;
      if (/^<\/a\b/.test(lower)) insideAnchor = false;
      if (/^<script\b/.test(lower)) insideScript = true;
      if (/^<\/script\b/.test(lower)) insideScript = false;
      if (/^<style\b/.test(lower)) insideStyle = true;
      if (/^<\/style\b/.test(lower)) insideStyle = false;
      output.push(token);
      continue;
    }

    if (insideAnchor || insideScript || insideStyle) {
      output.push(token);
      continue;
    }

    output.push(
      token.replace(urlRegex, (match) => {
        const trimmed = match.replace(/[.,;:!?)]+$/, "");
        const trailing = match.slice(trimmed.length);
        return `<a href="${escapeAttr(trimmed)}">${trimmed}</a>${trailing}`;
      }),
    );
  }

  return output.join("");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function readFileIfExists(input: string): string | null {
  if (!existsSync(input)) return null;
  try {
    if (!statSync(input).isFile()) return null;
  } catch {
    return null;
  }
  return readFileSync(input, "utf-8");
}

function maybeReadFile(input: string): string {
  return readFileIfExists(input) ?? input;
}

function looksLikeXml(input: string): boolean {
  return /^\s*</.test(input);
}

function templateExists(templates: any, name: string): boolean {
  if (typeof templates.has === "function" && templates.has(name)) return true;
  if (Array.isArray(templates.list?.()) && templates.list().includes(name)) return true;
  return false;
}

function unwrapCslEntry(entryHtml: string): string | null {
  const trimmed = entryHtml.trim();
  const match = trimmed.match(/^<div\b([^>]*)>([\s\S]*)<\/div>$/s);
  if (!match) return null;

  const attrs = match[1] ?? "";
  if (!/\bclass\s*=\s*["'][^"']*\bcsl-entry\b/i.test(attrs)) return null;

  return (match[2] ?? "").trim();
}

function sanitizeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

/** Visible text for comparing a rendered variable with a title: no tags, plain quotes, any case. */
function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:amp|#38|#x26);/gi, "&")
    .replace(/[\u2018\u2019]|&(?:#39|#x27|apos|rsquo|lsquo);/gi, "'")
    .replace(/[\u201c\u201d\u201e]|&(?:quot|#34|#x22|ldquo|rdquo);/gi, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Add a class to the attributes, after any the caller gave. */
function withClass(attrs: HtmlAttributes, className: string): HtmlAttributes {
  const { class: extra, ...rest } = attrs;
  const classes = [typeof extra === "string" ? extra : "", className].filter(Boolean).join(" ");
  return { ...rest, class: classes };
}

function renderAttributes(attrs: HtmlAttributes): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) parts.push(k);
    else if (v !== false) parts.push(`${k}="${escapeAttr(String(v))}"`);
  }
  return parts.length ? " " + parts.join(" ") : "";
}

function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}
