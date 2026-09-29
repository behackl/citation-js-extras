/**
 * `bib.bibtex(entry)`: an entry as BibTeX that stands on its own, for readers
 * to copy from a publication list.
 */
import Cite from "citation-js";
import { describe, expect, it } from "vitest";
import { Bibliography, badgePresets } from "../src/index.js";
import { REALISTIC_BIB } from "./fixtures.js";

const BIB = String.raw`@String{press = "Invented Press"}
@Article{doe:2024,
  Author  = "Doe, Jane and {Research Group}",
  TITLE   = "Don't {"}quote{"} \emph{very} large $L^p$ \{sets\} at 50\%",
  journal = press # " Ser. " # {B},
  year    = 2024, month = mar,
  note    = {Spread over
             two lines},
  status  = {published},
}
`;

// Representative title mappings, chains, and a parent defined after its
// child; abbreviations that use abbreviations. The table below covers every mapping.
const CROSSREF_BIB = String.raw`@string{inv = "Invented"}
@string{press = inv # " Press"}
@string{lnim = {Lecture Notes in Imaginary Mathematics}}
@inbook{chapter, author = {Doe, Jane}, title = {Heights}, pages = {1--9}, crossref = {trees}}
@book{trees, title = {Trees}, subtitle = {and Forests}, volume = 2, crossref = {works}}
@mvbook{works, author = {Roe, Rick}, title = {Collected Works}, publisher = press, year = 2019, volumes = 3}
@collection{structures, editor = {Roe, Rick}, title = {Random Structures}, series = lnim, number = 7,
  publisher = press, address = {Graz}, year = 2020, month = jun}
@incollection{heights, author = {Doe, Jane}, title = {Heights of {$k$}-ary trees}, pages = {10--20}, crossref = {structures}}
@proceedings{fci, title = {Proceedings of the Fictional Conference on Imaging}, booktitle = {FCI 2021},
  publisher = press, year = 2021, sortkey = {fci}}
@inproceedings{talk, author = {Sato, Ren}, title = {Learning priors}, pages = {5--6}, crossref = {fci}}
@periodical{issue, title = {Journal of Imaginary Combinatorics}, titleaddon = {Special issue}, volume = 60, number = 2, year = 2024}
@article{editorial, author = {Doe, Jane}, title = {Editorial}, crossref = {issue}}
@incollection{classic, author = {Doe, Jane}, title = {In a classic volume}, crossref = {oldbook}}
@book{oldbook, title = {A Classic Volume}, booktitle = {A Classic Volume}, editor = {Roe, Rick}, publisher = inv, year = 1990}
@misc{orphan, title = {Orphan}, crossref = {missing}}
@inbook{shouting, title = {Shouting}, crossref = {TREES}}
`;

/** CSL-JSON as citeproc gets it, without the record of the source text. */
const cslOf = ({ _graph, ...csl }: Record<string, any>) => csl;

describe("bibtex", () => {
  it("writes the key, type and fields as in the .bib file, abbreviations resolved", () => {
    const bib = new Bibliography({ data: BIB, preserveMath: true });
    expect(bib.bibtex(bib.entries[0]!)).toBe(String.raw`@article{doe:2024,
  author = {Doe, Jane and {Research Group}},
  title = {Don't {"}quote{"} \emph{very} large $L^p$ \{sets\} at 50\%},
  journal = {Invented Press Ser. B},
  year = {2024},
  month = mar,
  note = {Spread over two lines},
  status = {published},
}`);
  });

  it("fills in crossref parents as formatting does: biblatex's rules, chains included", () => {
    const bib = new Bibliography({ data: CROSSREF_BIB });
    const entry = (key: string) => bib.entries.find(entry => entry.key === key)!;
    // The proceedings' title becomes the booktitle; its own booktitle and sortkey don't carry over.
    expect(bib.bibtex(entry("talk"))).toBe(`@inproceedings{talk,
  author = {Sato, Ren},
  title = {Learning priors},
  pages = {5--6},
  booktitle = {Proceedings of the Fictional Conference on Imaging},
  publisher = {Invented Press},
  year = {2021},
}`);
    // Through a book to a multi-volume book: booktitle, maintitle, and the book's author as bookauthor.
    expect(bib.bibtex(entry("chapter"))).toBe(`@inbook{chapter,
  author = {Doe, Jane},
  title = {Heights},
  pages = {1--9},
  volume = {2},
  publisher = {Invented Press},
  year = {2019},
  volumes = {3},
  maintitle = {Collected Works},
  bookauthor = {Roe, Rick},
  booktitle = {Trees},
  booksubtitle = {and Forests},
}`);
    expect(bib.bibtex(entry("editorial"))).toContain("journaltitle = {Journal of Imaginary Combinatorics},");
    expect(bib.bibtex(entry("editorial"))).not.toContain("titleaddon");
    // Nothing to fill in from: the reference stays, as in the file. citation-js
    // matches keys case-sensitively, so `TREES` is not `trees`.
    expect(bib.bibtex(entry("orphan"))).toContain("crossref = {missing}");
    expect(bib.bibtex(entry("shouting"))).toBe("@inbook{shouting,\n  title = {Shouting},\n  crossref = {TREES},\n}");
  });

  const titleMappingGroups: Array<[parent: string, children: string[], prefix: string]> = [
    ["mvbook", ["book", "inbook", "bookinbook", "suppbook"], "main"],
    ["mvcollection", ["collection", "reference", "incollection", "inreference", "suppcollection"], "main"],
    ["mvreference", ["collection", "reference", "incollection", "inreference", "suppcollection"], "main"],
    ["mvproceedings", ["proceedings", "inproceedings"], "main"],
    ["book", ["inbook", "bookinbook", "suppbook"], "book"],
    ["collection", ["incollection", "inreference", "suppcollection"], "book"],
    ["reference", ["incollection", "inreference", "suppcollection"], "book"],
    ["proceedings", ["inproceedings"], "book"],
    ["periodical", ["article", "suppperiodical"], "journal"],
  ];
  const titleMappings = titleMappingGroups.flatMap(([parent, children, prefix]) =>
    children.map<[string, string, string]>(child => [parent, child, prefix]));

  it.each(titleMappings)("remaps %s titles for %s to %stitle", (parent, child, prefix) => {
    const bib = new Bibliography({ data: `
@${parent}{parent, author={Parent, Pat}, title={Parent title}, subtitle={Parent subtitle},
  titleaddon={Parent addon}, shorttitle={Short}, sorttitle={Sort}, indextitle={Index}, indexsorttitle={Index sort},
  publisher={Press}, year={2025}, project={Public project}}
@${child}{child, author={Child, Chris}, title={Child title}, crossref={parent}}
` });
    const entry = bib.entries.find(entry => entry.key === "child")!;
    const text = bib.bibtex(entry);
    // plugin-bibtex 0.7.21's text autodetection only recognises entry types up
    // to 13 letters, missing lone suppcollection/suppperiodical entries. Parse
    // explicitly so the complete mapping matrix doesn't depend on that bug.
    const [copy] = Cite.plugins.input.data(text, "@biblatex/text");
    expect(copy.type).toBe(child);
    expect(copy.label).toBe("child");
    expect(copy.properties).toMatchObject({
      author: "Child, Chris", title: "Child title", publisher: "Press", year: "2025",
      project: "Public project", [`${prefix}title`]: "Parent title", [`${prefix}subtitle`]: "Parent subtitle",
    });
    if (prefix !== "journal") expect(copy.properties[`${prefix}titleaddon`]).toBe("Parent addon");
    else expect(copy.properties).not.toHaveProperty("journaltitleaddon");
    for (const field of ["crossref", "subtitle", "titleaddon", "shorttitle", "sorttitle", "indextitle", "indexsorttitle"]) {
      expect(copy.properties).not.toHaveProperty(field);
    }
    if (["mvbook", "book"].includes(parent) && ["inbook", "bookinbook", "suppbook"].includes(child)) {
      expect(copy.properties.bookauthor).toBe("Parent, Pat");
    }
    const [csl] = new Cite(text, { forceType: "@biblatex/text" }).data;
    expect(cslOf(csl!)).toEqual(cslOf(entry.csl));
  });

  it.each([
    "ids", "crossref", "xref", "entryset", "entrysubtype", "execute", "label", "options", "presort",
    "related", "relatedoptions", "relatedstring", "relatedtype", "shorthand", "shorthandintro", "sortkey",
  ])("does not inherit parent metadata: %s", field => {
    const bib = new Bibliography({ data: `
@proceedings{parent, title={Parent}, ${field}={metadata}}
@inproceedings{child, title={Child}, crossref={parent}}
` });
    const entry = bib.entries.find(entry => entry.key === "child")!;
    const copy = new Bibliography({ data: bib.bibtex(entry) }).entries[0]!;
    expect(copy.raw.booktitle).toBe("Parent");
    expect(copy.raw).not.toHaveProperty(field);
  });

  it.each(["project", "constructor"])("inherits custom field %s, with child values taking precedence", field => {
    const bib = new Bibliography({ data: `
@misc{parent, title={Parent}, ${field}={Inherited value}}
@misc{child, title={Child}, crossref={parent}}
@misc{override, title={Override}, ${field}={Child value}, crossref={parent}}
` });
    const copyOf = (key: string) => new Bibliography({
      data: bib.bibtex(bib.entries.find(entry => entry.key === key)!),
    }).entries[0]!;
    expect(copyOf("child").raw[field]).toBe("Inherited value");
    expect(copyOf("override").raw[field]).toBe("Child value");
  });

  it("keeps a child's own metadata and does not remap classic book/incollection titles", () => {
    const bib = new Bibliography({ data: `
@book{parent, title={Parent}, author={Parent, Pat}, shorthand={P}}
@incollection{child, title={Child}, shorthand={C}, crossref={parent}}
` });
    const entry = bib.entries.find(entry => entry.key === "child")!;
    const copy = new Bibliography({ data: bib.bibtex(entry) }).entries[0]!;
    expect(copy.raw.shorthand).toBe("C");
    expect(copy.raw.title).toBe("Child");
    expect(copy.raw).not.toHaveProperty("booktitle");
  });

  it("excludes inherited fields without changing the source fields", () => {
    const bib = new Bibliography({ data: CROSSREF_BIB });
    const entry = bib.entries.find(entry => entry.key === "chapter")!;
    const before = bib.entries.map(entry => ({ ...entry.raw }));
    const text = bib.bibtex(entry, { exclude: ["PUBLISHER", "booktitle"] });
    expect(text).not.toMatch(/publisher|booktitle/);
    expect(text).toContain("maintitle = {Collected Works}");
    expect(bib.entries.map(entry => entry.raw)).toEqual(before);
    expect(bib.bibtex(entry)).toContain("booktitle = {Trees}");
  });

  it("leaves out excluded fields, case-insensitively", () => {
    const bib = new Bibliography({ data: BIB });
    const text = bib.bibtex(bib.entries[0]!, { exclude: ["STATUS", "note"] });
    expect(text).not.toMatch(/status|note/);
    expect(text).toContain("journal = {Invented Press Ser. B},");
  });

  it("reads back as the same entry", () => {
    const options = { cslStyle: "apa", customFields: ["status", "project"], badges: Object.values(badgePresets) };
    const bib = new Bibliography({ data: REALISTIC_BIB, ...options });
    const fields = (raw: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(raw).map(([name, value]) => [name, String(value)]));
    for (const entry of bib.entries) {
      const [copy] = new Bibliography({ data: bib.bibtex(entry), ...options }).entries;
      expect(copy!.key).toBe(entry.key);
      expect(fields(copy!.raw)).toEqual(fields(entry.raw));
      expect(cslOf(copy!.csl)).toEqual(cslOf(entry.csl));
      expect(bib.formatEntry(copy!)).toBe(bib.formatEntry(entry));
    }
  });

  it("reads back without its parents as what the page shows", () => {
    for (const data of [BIB, CROSSREF_BIB]) {
      const bib = new Bibliography({ data });
      for (const entry of bib.entries) {
        const text = bib.bibtex(entry);
        const [copy] = new Bibliography({ data: text }).entries;
        expect(cslOf(copy!.csl), `${entry.key}:\n${text}`).toEqual(cslOf(entry.csl));
        expect(bib.formatEntry(copy!), entry.key).toBe(bib.formatEntry(entry));
      }
    }
  });

  it("refuses an entry of another bibliography", () => {
    const bib = new Bibliography({ data: BIB });
    const other = new Bibliography({ data: "@misc{elsewhere, title = {T}}" });
    expect(() => bib.bibtex(other.entries[0]!)).toThrow("entry elsewhere: not in this bibliography");
  });

  it("refuses a foreign entry even when its key matches", () => {
    const bib = new Bibliography({ data: "@article{same, title={Article}}" });
    const other = new Bibliography({ data: "@book{same, title={Book}}" });
    expect(() => bib.bibtex(other.entries[0]!)).toThrow("entry same: not in this bibliography");
  });

  it("accepts shallow entry copies but rejects replaced raw objects and changed keys", () => {
    const bib = new Bibliography({ data: BIB });
    const entry = bib.entries[0]!;
    expect(bib.bibtex({ ...entry })).toBe(bib.bibtex(entry));
    expect(() => bib.bibtex({ ...entry, raw: { ...entry.raw } })).toThrow("not in this bibliography");
    expect(() => bib.bibtex({ ...entry, key: "changed" })).toThrow("entry changed: not in this bibliography");
  });

  it("survives as an HTML attribute, for a copy button (docs/layout.md)", () => {
    const bib = new Bibliography({ data: BIB });
    const html = bib.formatHtml(bib.entries, {
      itemAttributes: entry => ({ "data-bibtex": bib.bibtex(entry, { exclude: ["status"] }) }),
    });
    const attribute = html.match(/data-bibtex="([^"]*)"/)![1]!;
    const decoded = attribute.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&amp;/g, "&");
    expect(decoded).toBe(bib.bibtex(bib.entries[0]!, { exclude: ["status"] }));
  });
});
