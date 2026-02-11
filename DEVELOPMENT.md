# Development Guide

## Code Quality Tools

### ESLint

- **Purpose**: Code linting and style enforcement
- **Config**: `eslint.config.js`
- **Commands**:
  - `npm run lint` - Check for issues
  - `npm run lint:fix` - Auto-fix issues

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

## Configuration Files

- `eslint.config.js` - ESLint configuration
- `.husky/pre-commit` - Pre-commit hook
- `.husky/pre-push` - Pre-push hook
- `package.json` - Contains lint-staged configuration
