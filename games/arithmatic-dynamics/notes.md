## Running TypeScript scripts

Node 20 cannot load `.ts` directly. Options:

1. **tsx (chosen)** — `tsx scripts/split-manifest.ts`.
   Also works as a loader: `node --import tsx scripts/split-manifest.ts`.
2. **Node 22.6+ type stripping** —
   `node --experimental-strip-types scripts/split-manifest.ts`
   (unflagged in Node 23.6+). Requires erasable-only syntax: no `enum`,
   no `namespace`, no parameter properties, and `import type` everywhere.
3. **Compile first** — `tsc -p tsconfig.build.json && node dist/scripts/split-manifest.js`.

Because `package.json` has `"type": "module"`, `.ts` files are treated as
ESM; use `import`/`export`, not `require`. Relative imports should keep the
`.ts` extension (allowed via `allowImportingTsExtensions`) or use `.js`
specifiers — tsx resolves both.