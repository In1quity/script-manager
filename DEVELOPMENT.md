# Development Guide

## Architecture

- `src/App.js` is the Vite entry point and bootstrap layer.
- Modular runtime lives under `src/components`, `src/services`, `src/utils`, `src/constants`, and `src/styles`.
- `src/services/bootstrap.js` orchestrates readiness → data preload → UI runtime start.
- `src/services/coreRuntime.js` starts UI orchestration (no legacy runtime bridge).
- `src/services/pageUi.js` wires page-level UI (heading/indicator, marked links, infobox, snippet Install buttons). Snippet buttons are skipped when the page content model is JS/CSS.
- `src/services/uiOrchestrator.js` coordinates UI entry points (`showUi`, install links, open handlers).
- `src/services/summaryBuilder.js` centralizes edit summaries and interwiki summary links.
- `src/services/imports.js` parses imports (including gadget `load.php?modules=…` URLs) and documentation references: `@documentation`, `Documentation:`, or `@see` (first 2000 characters).
- `src/services/installRisk.js` scans scripts for network loads; the install dialog deep-check uses max depth 3.
- `src/services/settings.js` stores default tab locally and interceptor / load-caching preferences globally; Settings UI also shows `SM_VERSION` and `BUILD_DATE`.
- `scr/scriptManager.js` is the loader source; `scr/scriptManager-capture.js` is the capture wrapper. Both are copied into `dist/` with a single JSDoc-style banner (version, license, docs, build date). Vite builds the core bundle; loader and capture files are banner-injected only, not bundled.

Path aliases (Vite + Vitest): `@`, `@components`, `@services`, `@utils`, `@constants`, `@styles`.

## Code quality tools

### ESLint

- Config: `eslint.config.js`
- `npm run lint` / `npm run lint:fix`

### Stylelint

- Config: `stylelint.config.js` (CSS under `src/`)
- Included in `npm run lint` / `npm run lint:fix`

### Tests

- Runner: Vitest (`vitest.config.js`), environment `jsdom`
- Include: `src/**/*.test.js`
- Commands: `npm run test` (watch), `npm run test:run` (CI-style single run)
- `--passWithNoTests` remains enabled so an empty suite still exits 0

### Husky + lint-staged

- `pre-commit`: ESLint on staged `*.js`
- `pre-push`: full `npm run lint`

### CI / release

- CI (`.github/workflows/ci.yml`): Node 22, `npm ci`, lint, build, check `dist/scriptManager.js` and `dist/scriptManager-core.js`
- Deploy (`.github/workflows/deploy.yml`): on `v*` tags, build and attach loader, core, and capture artifacts to the GitHub Release

## Line endings (Windows)

The project uses LF (`.gitattributes`). On Windows, in this repo:

```bash
git config core.autocrlf false
```

Then run `npm run lint:fix` once if the working copy had CRLF.

## Workflow

1. Before committing: Husky runs lint-staged
2. Manual quality pass: `npm run lint:fix` then `npm run test:run`
3. Build: `npm run build` (lint + dev + prod). Outputs:
   - `dist/scriptManager-core.js` — Vite IIFE bundle (Vue/Codex runtime)
   - `dist/scriptManager.js` — loader from `scr/` (+ banner)
   - `dist/scriptManager-capture.js` — capture from `scr/` (+ banner)

## Configuration files

| File | Role |
| --- | --- |
| `eslint.config.js` | ESLint flat config |
| `stylelint.config.js` | Stylelint |
| `vite.config.js` | Build, banners, loader/capture copy |
| `vitest.config.js` | Unit tests |
| `.husky/pre-commit` / `pre-push` | Git hooks |
| `package.json` | Scripts, engines, lint-staged |
| `data/languageFallbacks.json` | i18n fallback chain |
| `.github/workflows/*` | CI and release |

## Localization for developers

- Source messages: `i18n/en.json`
- Translator documentation: `i18n/qqq.json`
- Community translations: [translatewiki.net — Script-manager](https://translatewiki.net/wiki/Translating:Script-manager)
- Fetch base URL at runtime: `https://gitlab-content.toolforge.org/iniquity/script-manager/-/raw/main/i18n` (overridable via `window.ScriptManagerI18nBaseUrl`)

## Wiki documentation

User-facing product docs live on [Script_Manager](https://www.mediawiki.org/wiki/Script_Manager). Keep that page aligned with user-visible behavior when releasing.
