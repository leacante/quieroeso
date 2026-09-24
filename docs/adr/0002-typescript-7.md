# ADR 0002 — TypeScript 7 with a TypeScript 6 shim for ESLint

- Status: accepted
- Date: 2026-09-24

## Context

The plan fixes TypeScript 7. TypeScript 7.0 (native Go compiler) ships without the
programmatic compiler API (`ts.createProgram`, `ts.factory`, …); Microsoft targets it for 7.1.
Next.js 16.3 supports TS 7 for `next build` type checking, but `typescript-eslint` 8.x
requires `typescript >=4.8.4 <6.1.0` and imports the API directly.

## Decision

- `typescript@7.0.2` is the project compiler: `pnpm typecheck` and `next build` use it.
- `.pnpmfile.cjs` rewrites the `typescript` peer of `typescript-eslint` packages (and
  `eslint-import-resolver-typescript`) to `npm:@typescript/typescript6@6.0.2`, the
  compatibility package Microsoft recommends. Only ESLint sees TS 6.
- ESLint stays on 9.39: `eslint-config-next@16.3.6` depends on `eslint-plugin-react`,
  `eslint-plugin-import` and `eslint-plugin-jsx-a11y`, which do not support ESLint 10 yet.

## Consequences

- Type-aware lint rules run on TS 6 semantics; syntax exclusive to TS 7 would fail lint.
- Remove the pnpmfile hook once `typescript-eslint` supports TS 7.1+.
- Upgrade ESLint to 10 once `eslint-config-next` supports it.
