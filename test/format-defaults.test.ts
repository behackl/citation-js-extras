import { describe, expect, it } from "vitest";
import { Bibliography } from "../src/index.js";
import type { BadgeConfig } from "../src/types.js";
import { SAMPLE_BIB } from "./fixtures.js";

const BADGES: BadgeConfig[] = [
  { field: "doi", label: "doi", url: "https://doi.org/$1", className: "badge" },
];

const MATH_BIB = `
@Article{math:2024,
  author = {Doe, Jane},
  title  = {Random $k$-ary trees},
  year   = {2024},
}

@Article{plain:2023,
  author = {Roe, Richard},
  title  = {No mathematics here},
  year   = {2023},
}
`;

describe("formatting defaults from the constructor", () => {
  it("lets a call override the defaults", () => {
    const bib = new Bibliography({ data: SAMPLE_BIB, customFields: ["doi"], badges: BADGES });
    expect(bib.formatHtml(bib.entries, { badges: [] })).not.toContain('class="badge"');
  });
});

describe("every formatting option works as a constructor default, in formatHtml and formatEntry", () => {
  // Options have been honoured by one method and ignored by the other before,
  // so each row is checked through both. The chapter has an editor, whose term
  // differs between locales ("Ed."/"Hrsg.").
  const data = `${SAMPLE_BIB}\n@incollection{chapter, author={Doe, Jane}, title={Chapter}, booktitle={Book}, editor={Roe, Richard}, year={2020}, publisher={X}}`;
  const withDoi = { badges: [{ ...BADGES[0]!, className: undefined }] };
  const bareUrl = (html: string) => /<a href="(https?:[^"]+)">\1<\/a>/.test(html);
  type Row = [string, Record<string, unknown>, (html: string) => boolean, { base?: object; listOnly?: boolean }?];
  const rows: Row[] = [
    ["titleLink", { titleLink: ["doi"] }, html => html.includes('<a href="https://doi.org/10.1234/jws.2023.001">On the Enumeration')],
    ["badges", { badges: BADGES }, html => html.includes('class="badge"')],
    ["linkifyUrls", { linkifyUrls: false }, html => !bareUrl(html)],
    ["printLinkedIdentifiers", { printLinkedIdentifiers: true }, html => html.includes(">https://doi.org/10.5678/gr.2024.003</a>")],
    ["appendBadges", { appendBadges: false }, html => !html.includes("bib-links"), { base: withDoi }],
    ["badgeListClassName", { badgeListClassName: "links" }, html => html.includes('<span class="links">'), { base: withDoi }],
    ["itemAttributes", { itemAttributes: () => ({ "data-x": "1" }) }, html => html.includes('data-x="1"'), { listOnly: true }],
    ["linkAttributes", { linkAttributes: () => ({ class: "l" }) }, html => html.includes('<a class="l" href=')],
    ["wrapVariable", { wrapVariable: (inner: string) => `<w>${inner}</w>` }, html => html.includes("<w>")],
    ["sanitize", { sanitize: () => "clean" }, html => !html.includes("<")],
    ["lang", { lang: "de-DE" }, html => html.includes("(Hrsg.)")],
  ];
  for (const [name, options, check, { base = {}, listOnly = false } = {}] of rows) {
    it(name, () => {
      const outputs = (bib: Bibliography) => [
        bib.formatHtml(bib.entries),
        ...(listOnly ? [] : [bib.entries.map(entry => bib.formatEntry(entry)).join("\n")]),
      ];
      for (const html of outputs(new Bibliography({ data, cslStyle: "apa", ...base, ...options }))) {
        expect(check(html)).toBe(true);
      }
      // Without the option, the check fails: the option is what makes the difference.
      for (const html of outputs(new Bibliography({ data, cslStyle: "apa", ...base }))) {
        expect(check(html)).toBe(false);
      }
    });
  }
});

describe("math", () => {
  it("names the entry whose formula could not be rendered, keeping the cause", () => {
    const bib = new Bibliography({ data: MATH_BIB, preserveMath: true });
    const failing = () => { throw new Error("Undefined control sequence"); };
    let error: Error | undefined;
    try { bib.formatHtml(bib.entries, { renderMath: failing }); } catch (e) { error = e as Error; }
    expect(error?.message).toBe("entry math:2024: Undefined control sequence");
    expect(error?.cause).toBeInstanceOf(Error);
  });

  it("does not linkify the MathML namespace URL of rendered math", () => {
    const bib = new Bibliography({ data: MATH_BIB, preserveMath: true });
    const html = bib.formatHtml(bib.entries, {
      // Stand-in for KaTeX/MathJax output, which carries an xmlns URL.
      renderMath: tex => `<math xmlns="http://www.w3.org/1998/Math/MathML">${tex}</math>`,
    });
    expect(html).toContain('xmlns="http://www.w3.org/1998/Math/MathML"');
    expect(html).not.toContain('<a href="http://www.w3.org/1998/Math/MathML"');
  });
});
