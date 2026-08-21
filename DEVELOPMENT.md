# Development Guide

## Architecture

- `src/App.js` is the Vite entry point and bootstrap layer.
- Modular runtime lives under `src/components`, `src/services`, `src/utils`, `src/constants`, and `src/styles`.
- `src/services/bootstrap.js` orchestrates readiness -> data preload -> UI runtime start.
- `src/services/coreRuntime.js` starts UI orchestration (no legacy runtime bridge).
- `src/services/pageUi.js` wires page-level UI (heading/indicator, marked links, infobox, snippet Install buttons).
- `src/services/uiOrchestrator.js` coordinates UI entry points (`showUi`, install links, open handlers).
- `src/services/summaryBuilder.js` centralizes edit summaries and interwiki summary links.
- `src/services/imports.js` parses imports and documentation references (`@documentation`, `Documentation:`, `@see`).
- `src/services/installRisk.js` scans scripts for external network loads; deep scan in install dialog uses depth 3.
- `src/services/settings.js` stores default tab locally and interceptor/load-caching preferences globally.
- `src/services/captureRuntime.js` loads and memoizes capture runtime bootstrap code.
- `src/utils/scriptLock.js` serializes install/uninstall/move operations by script key.
- `scr/scriptManager.js` is loader source; `scr/scriptManager-capture.js` is capture wrapper source. Both are copied to `dist/` with a banner.

Path aliases (Vite + Vitest): `@`, `@components`, `@services`, `@utils`, `@constants`, `@styles`.

## Code quality tools

### ESLint

- Config: `eslint.config.js`
- `npm run lint` / `npm run lint:fix`

### Stylelint

- Config: `stylelint.config.js` (CSS under `src/`)
- Included in `npm run lint` / `npm run lint:fix`

### Tests

- **Commands**: `npm run test` (watch), `npm run test:run` (single run). Uses Vitest.

### Husky + lint-staged

- **Purpose**: Pre-commit hooks for automatic code quality checks
- **Hooks**:
  - `pre-commit`: Runs lint-staged
  - `pre-push`: Runs full lint + test suite

## Line endings (Windows)

The project uses LF (`.gitattributes`). On Windows, in this repo:

```bash
git config core.autocrlf false
```

Then run `npm run lint:fix` once if the working copy had CRLF.

## Workflow

1. **Before committing**: Husky runs lint-staged
2. **Manual linting**: `npm run lint:fix`
3. **Build artifacts**: `npm run build` runs lint then production build. Outputs:
   - `dist/scriptManager-core.js` — Vite bundle (Vue/Codex runtime)
   - `dist/scriptManager.js` — loader (from `scr/`, with banner)
   - `dist/scriptManager-capture.js` — capture script (from `scr/`, with banner)

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

Keep the [Script_Manager](https://www.mediawiki.org/wiki/Script_Manager) page aligned with the implementation when shipping user-facing changes (install dialog behavior, snippet install button, repository links, and settings wording).
