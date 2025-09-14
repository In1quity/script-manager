# Development Guide

## Code Quality Tools

### Prettier

- **Purpose**: Automatic code formatting
- **Config**: `.prettierrc`
- **Commands**:
  - `npm run format` - Format all files
  - `npm run format:check` - Check formatting without changes

### ESLint

- **Purpose**: Code linting and style enforcement
- **Config**: `eslint.config.js`
- **Commands**:
  - `npm run lint` - Check for issues
  - `npm run lint:fix` - Auto-fix issues

### Husky + lint-staged

- **Purpose**: Pre-commit hooks for automatic code quality checks
- **Hooks**:
  - `pre-commit`: Runs ESLint and Prettier on staged files
  - `pre-push`: Runs full linting and formatting checks

## Workflow

1. **Before committing**: Husky automatically runs lint-staged
2. **Manual formatting**: `npm run format`
3. **Manual linting**: `npm run lint:fix`

## Configuration Files

- `.prettierrc` - Prettier configuration
- `.prettierignore` - Files to ignore for formatting
- `eslint.config.js` - ESLint configuration
- `.husky/pre-commit` - Pre-commit hook
- `.husky/pre-push` - Pre-push hook
- `package.json` - Contains lint-staged configuration
