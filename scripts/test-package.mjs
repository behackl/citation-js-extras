import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const pnpm = process.env.npm_execpath;
assert(pnpm, "Run this check with pnpm run test:package");
const temp = mkdtempSync(join(tmpdir(), "citation-js-extras-consumer-"));
// npm_execpath can point to pnpm's JS entry point or its standalone executable.
const isScript = /\.[cm]?js$/.test(pnpm);
const run = (args, cwd = temp) => execFileSync(
  isScript ? process.execPath : pnpm,
  isScript ? [pnpm, ...args] : args,
  { cwd, stdio: "inherit", timeout: 120_000 },
);

try {
  run(["pack", "--pack-destination", temp], root);
  const tarballs = readdirSync(temp).filter(name => name.endsWith(".tgz"));
  assert.equal(tarballs.length, 1);
  // Install the actual tarball, not a workspace link. Direct dependency versions
  // match the current installation. Fresh CI stores may need registry metadata
  // to resolve transitive ranges, so prefer cached data without requiring it.
  writeFileSync(join(temp, "package.json"), JSON.stringify({
    private: true,
    type: "module",
    dependencies: {
      "@behackl/citation-js-extras": `file:./${tarballs[0]}`,
      "citation-js": require("citation-js/package.json").version,
      "@mathjax/src": require("@mathjax/src/package.json").version,
      typescript: require("typescript/package.json").version,
    },
  }, null, 2));
  run(["install", "--prefer-offline", "--ignore-scripts"]);

  const packed = JSON.parse(readFileSync(
    join(temp, "node_modules/@behackl/citation-js-extras/package.json"), "utf8",
  ));
  assert.equal(Object.keys(packed.exports["."])[0], "types");

  writeFileSync(join(temp, "consumer.ts"), `
import { Bibliography, type MathRenderer, type BibliographyOptions } from "@behackl/citation-js-extras";
const options: BibliographyOptions = { data: "@article{a,title={Test {$x$}},year={2025}}", preserveMath: true };
const bib = new Bibliography(options);
const renderMath: MathRenderer = (tex, { display }) => display ? tex : tex;
const html: string = bib.formatHtml(bib.entries, { renderMath });
const entry: string = bib.formatEntry(bib.entries[0], { renderMath });
`);
  // Exercise both Node and bundler resolution against the published exports.
  for (const [module, moduleResolution] of [["NodeNext", "NodeNext"], ["ESNext", "Bundler"]]) {
    run(["exec", "tsc", "--noEmit", "--strict", "--target", "ES2022",
      "--module", module, "--moduleResolution", moduleResolution, "consumer.ts"]);
  }

  writeFileSync(join(temp, "consumer.mjs"), String.raw`
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Bibliography } from "@behackl/citation-js-extras";
const require = createRequire(import.meta.url);
const { mathjax } = require("@mathjax/src/js/mathjax.js");
const { TeX } = require("@mathjax/src/js/input/tex.js");
require("@mathjax/src/js/input/tex/ams/AmsConfiguration.js");
const { SVG } = require("@mathjax/src/js/output/svg.js");
const { liteAdaptor } = require("@mathjax/src/js/adaptors/liteAdaptor.js");
const { RegisterHTMLHandler } = require("@mathjax/src/js/handlers/html.js");
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const document = mathjax.document("", {
  InputJax: new TeX({ packages: ["base", "ams"] }),
  OutputJax: new SVG({ fontCache: "none" }),
});
const bib = new Bibliography({
  data: "@article{a,title={Test {$\\alpha + \\frac{1}{\\pi}$}},author={Doe, Jane},year={2025}}",
  preserveMath: true,
});
let calls = 0;
const html = bib.formatHtml(bib.entries, {
  renderMath(tex, { display }) {
    calls++;
    assert.equal(tex, "\\alpha + \\frac{1}{\\pi}");
    return adaptor.outerHTML(document.convert(tex, { display }));
  },
});
assert.equal(calls, 1);
assert(html.includes("<svg"));
assert(html.includes("<path"));
assert(!html.includes("data-mjx-error"));
assert(!html.includes("bibmathplaceholder"));
console.log("Packed consumer: public ESM import + MathJax SVG PASS");
`);
  execFileSync(process.execPath, ["consumer.mjs"], { cwd: temp, stdio: "inherit", timeout: 30_000 });
  console.log("Packed consumer: NodeNext + Bundler declarations PASS");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
