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
and Bundler resolution, and MathJax rendering through the installed tarball.
It prefers the local package cache but may need the registry on a fresh
machine. CI runs both checks. MathJax is only a development dependency.

## Tests

- Test data is invented: no real people, titles or identifiers. DOIs use the
  `10.5555` prefix, which is reserved for examples. `test/realistic.bib` has
  the shapes real exports have; extend it rather than copying from a real
  bibliography.
- `test/engine.test.ts` checks that formatting without decoration is identical
  to citation-js's own output. Keep it green when touching the engine.
- Before adding a test, check that the behaviour isn't covered already; one
  focused test is better than several overlapping ones.
