# Development Guide

## Architecture

- `src/App.js` is the Vite entry point and bootstrap layer.
- `src/components`, `src/services`, `src/utils`, `src/constants`, and `src/styles` contain the modular runtime code.
- `src/core/scriptManagerCoreRuntime.js` is the authoritative runtime core source loaded by `src/services/coreRuntime.js`.
- `src/services/bootstrap.js` is the orchestration layer (readiness -> data preload -> runtime start).
- `src/services/coreRuntime.js` is the runtime adapter that starts the current core implementation.
- `scr/scriptManager.js` remains the loader source and is emitted as `dist/scriptManager.js` during build.

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
3. **Build artifacts**: `npm run build` emits:
   - `dist/scriptManager-core.js`
   - `dist/scriptManager.js`

## Configuration Files

- `eslint.config.js` - ESLint configuration
- `stylelint.config.js` - Stylelint configuration
- `vite.config.js` - Build outputs and artifact naming
- `.husky/pre-commit` - Pre-commit hook
- `.husky/pre-push` - Pre-push hook
- `package.json` - Contains lint-staged configuration
