# AGENTS.md

## Cursor Cloud specific instructions

Script Manager is a **client-side MediaWiki user script** (loader + Vue/Codex core + capture wrapper). There is **no backend, database, or local dev server** — the standard commands live in `package.json` and `DEVELOPMENT.md`.

### Non-obvious caveats

- **There is no `npm run dev` / dev server.** Vite runs in library/IIFE mode and only builds artifacts into `dist/` (`npm run build:dev`, `npm run build:prod`, or `npm run build` for both). `npm run build` runs `npm run lint` first via the `prebuild` hook.
- **The UI cannot be rendered locally.** The built `dist/scriptManager-core.js` pulls Vue and Codex at runtime via `mw.loader.using(...)` (they are not bundled) and needs a real MediaWiki wiki. End-to-end UI testing requires loading the built `dist/` artifacts into a live wiki by pointing a personal `global.js`/`common.js` at them.
- **Core logic is testable headlessly.** Vitest (jsdom) exercises the parsing/serialization/service logic with a mocked `mw` global — this is the way to run/verify core behavior without a wiki. Use `npm run test:run` for a single run (`npm run test` is watch mode).
- **CI does not run the test suite.** `.github/workflows/ci.yml` only runs `npm run lint` + `npm run build`, so run `npm run test:run` locally to validate logic changes.
- **Node >= 22 is required** (`engines`). Formatting is enforced by ESLint `@stylistic` (tabs, LF, single quotes, semicolons), **not Prettier** — run `npm run lint:fix` before `npm run lint`.
- **`dist/` and `node_modules/` are gitignored**; build artifacts are produced on demand and published on-wiki / GitLab, not committed.
