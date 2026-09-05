import type { MathRenderer } from "./types.js";

/** Text fields only: identifiers, URLs, names and custom metadata are untouched. */
const TEXT_FIELDS = new Set([
  "title", "subtitle", "titleaddon", "shorttitle", "booktitle", "booksubtitle",
  "booktitleaddon", "maintitle", "mainsubtitle", "maintitleaddon", "journaltitle",
  "journalsubtitle", "journal", "note", "annote", "abstract", "howpublished",
]);

interface Expression { tex: string; display: boolean; source: string }

export class MathProtector {
  private readonly expressions = new Map<string, Expression>();
  private readonly tokensBySource = new Map<string, string>();
  private readonly prefix: string;

  constructor(source: string) {
    let prefix = "bibmathplaceholder";
    while (source.toLowerCase().includes(prefix)) prefix += "x";
    this.prefix = prefix;
  }

  protect(properties: Record<string, any>, key: string): Record<string, any> {
    return Object.fromEntries(Object.entries(properties).map(([field, value]) => [
      field,
      TEXT_FIELDS.has(field) && typeof value === "string"
        ? this.scan(value, `${key}.${field}`) : value,
    ]));
  }

  private scan(value: string, context: string): string {
    let out = "";
    for (let i = 0; i < value.length;) {
      const opener = value.startsWith("$$", i) ? "$$"
        : value[i] === "$" ? "$"
        : value.startsWith("\\(", i) ? "\\("
        : value.startsWith("\\[", i) ? "\\[" : null;
      if (!opener) {
        // Consume escaped characters together, including literal dollars.
        const length = value[i] === "\\" && i + 1 < value.length ? 2 : 1;
        out += value.slice(i, i + length);
        i += length;
        continue;
      }
      const closer = opener === "\\(" ? "\\)" : opener === "\\[" ? "\\]" : opener;
      let end = i + opener.length;
      while (end < value.length && !value.startsWith(closer, end)) {
        end += value[end] === "\\" ? 2 : 1;
      }
      if (end >= value.length) throw new Error(`Unclosed math delimiter ${opener} in ${context}`);
      const tex = value.slice(i + opener.length, end);
      if (!tex.trim()) throw new Error(`Empty math expression in ${context}`);
      const source = value.slice(i, end + closer.length);
      // Identical source must remain identical to citeproc (e.g. title grouping).
      let token = this.tokensBySource.get(source);
      if (!token) {
        token = `${this.prefix}${this.expressions.size}end`;
        this.tokensBySource.set(source, token);
        this.expressions.set(token, { tex, source, display: opener === "$$" || opener === "\\[" });
      }
      out += token;
      i = end + closer.length;
    }
    return out;
  }

  restore(html: string, render?: MathRenderer): string {
    const pattern = new RegExp(`${this.prefix}\\d+end`, "gi");
    // Only replace text, never attribute values. Renderer output is inserted last.
    return html.split(/(<[^>]*>)/g).map(part => part.startsWith("<") ? part
      : part.replace(pattern, token => {
        const expression = this.expressions.get(token.toLowerCase());
        if (!expression) throw new Error(`Unknown math placeholder: ${token}`);
        return render ? render(expression.tex, { display: expression.display })
          : escapeHtml(expression.source);
      })).join("");
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
