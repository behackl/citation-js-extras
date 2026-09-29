# Contributing

## Checks

Use Node 24, as CI and publishing do.

```sh
pnpm install --frozen-lockfile
pnpm typecheck     # sources and tests; vitest itself doesn't check types
pnpm test          # unit tests, and MathJax SVG rendering (base + AMS)
pnpm test:package  # build, pack, install into a temporary project, test the exports
```

`test:package` checks the ESM import, the TypeScript declarations under NodeNext
and Bundler resolution (including exact optional properties), BibTeX copying,
and MathJax rendering through the installed tarball. It prefers the local
package cache but may need the registry on a fresh machine. CI runs all checks.
MathJax is only a development dependency.

## Releases

Bump `package.json`, date the changelog entry, run the checks above, and commit.
Push the release commit, then a matching `vX.Y.Z` tag. `publish.yml` publishes
that version to npm with provenance; the tag must match `package.json`.

A GitHub Release is optional and does not trigger publishing. The workflow can
also be run manually and skips versions already on npm.

## Tests

- Test data is invented: no real people, titles or identifiers. DOIs use the
  `10.5555` prefix, which is reserved for examples. `test/realistic.bib` has
  the shapes real exports have; extend it rather than copying from a real
  bibliography.
- `test/engine.test.ts` checks that formatting without decoration is identical
  to citation-js's own output. Keep it green when touching the engine.
- Before adding a test, check that the behaviour isn't covered already; one
  focused test is better than several overlapping ones.
