# Development Guide

## Architecture

- `src/App.js` is the Vite entry point and bootstrap layer.
- `src/components`, `src/services`, `src/utils`, `src/constants`, and `src/styles` contain the modular runtime code.
- `src/services/bootstrap.js` is the orchestration layer (readiness -> data preload -> UI runtime start).
- `src/services/coreRuntime.js` initializes UI orchestration directly (no runtime bridge).
- `src/services/pageUi.js` handles page-level UI integration points (heading button, indicators, install links).
- `src/services/uiOrchestrator.js` coordinates UI entry points (`showUi`, install links, open handlers).
- `src/services/summaryBuilder.js` centralizes summary text and interwiki summary links.
- `src/services/imports.js` parses script heads for documentation links: `@documentation`, `Documentation:`, or `@see` (first 2000 characters).
- `scr/scriptManager.js` is the loader source; `scr/scriptManager-capture.js` is the capture wrapper. Both are copied into `dist/` with a single JSDoc-style banner (version, license, docs, build date). Vite builds the core bundle; the loader and capture files are not bundled, only banner-injected and copied.

## Code Quality Tools

### ESLint

- **Purpose**: Code linting and style enforcement
- **Config**: `eslint.config.js`
- **Commands**:
  - `npm run lint` - Check for issues
  - `npm run lint:fix` - Auto-fix issues

### Stylelint

- **Purpose**: CSS linting for modular styles
- **Config**: `stylelint.config.js`
- **Commands**:
  - `npm run lint` - Includes style checks
  - `npm run lint:fix` - Auto-fix style issues where possible

### Tests

- **Commands**: `npm run test` (watch), `npm run test:run` (single run). Uses Vitest; `--passWithNoTests` so the project can have zero tests and still pass.

### Husky + lint-staged

- **Purpose**: Pre-commit hooks for automatic code quality checks
- **Hooks**:
  - `pre-commit`: Runs ESLint on staged files
  - `pre-push`: Runs full lint

## Line endings (Windows)

The project uses LF (`.gitattributes`). On Windows, set in this repo so pre-push passes:

```bash
git config core.autocrlf false
```

Then run `npm run lint:fix` once if the working copy had CRLF.

## Workflow

1. **Before committing**: Husky runs lint-staged
2. **Manual linting**: `npm run lint:fix`
3. **Build artifacts**: `npm run build` runs lint then both dev and prod builds. Outputs:
   - `dist/scriptManager-core.js` — Vite bundle (Vue/Codex runtime)
   - `dist/scriptManager.js` — loader (from `scr/`, with banner)
   - `dist/scriptManager-capture.js` — capture script (from `scr/`, with banner)

## Configuration Files

- `eslint.config.js` - ESLint configuration
- `stylelint.config.js` - Stylelint configuration
- `vite.config.js` - Build outputs and artifact naming
- `.husky/pre-commit` - Pre-commit hook
- `.husky/pre-push` - Pre-push hook
- `package.json` - Contains lint-staged configuration

## Wiki documentation

Suggested edits for the [Script_Manager](https://www.mediawiki.org/wiki/Script_Manager) wiki page (JSDoc doc link, install button on snippets, install dialog, repos) are collected in `docs/wiki-Script_Manager-updates.md`. Use it when syncing the wiki with the codebase.
