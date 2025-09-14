# Script Manager

A MediaWiki user script management system for managing and installing gadgets across different wikis.

## 📁 Project Structure

```
├── scr/
│   ├── scriptManager-core.js    # Main script logic
│   ├── scriptManager.js         # Loader and initialization
│   └── scriptManager-core.css   # Styles and UI
├── i18n/                        # Internationalization files
│   ├── en.json                  # English translations
│   └── ru.json                  # Russian translations
├── data/
│   └── languageFallbacks.json   # Language fallback mappings
├── .husky/                      # Git hooks
├── eslint.config.js             # ESLint configuration
├── .prettierrc                  # Prettier configuration
└── package.json                 # Dependencies and scripts
```

## 🌍 Localization

All language files are located in the `i18n/` folder and named according to the language code (e.g., `ru.json`, `en.json`).

Localization is loaded automatically based on the user's MediaWiki language (`wgUserLanguage`).

Language files are loaded directly from GitLab:

```
https://gitlab.wikimedia.org/iniquity/script-manager/-/raw/main/i18n/{lang}.json
```

If the file for the selected language is missing, English (`en.json`) is used as a fallback.

## 🛠️ Development

### Prerequisites

- Node.js 16+
- npm 8+

### Installation

```bash
npm install
```

### Available Scripts

| Command                | Description               |
| ---------------------- | ------------------------- |
| `npm run lint`         | Check code with ESLint    |
| `npm run lint:fix`     | Auto-fix ESLint issues    |
| `npm run format`       | Format code with Prettier |
| `npm run format:check` | Check code formatting     |

### Code Quality Tools

- **ESLint** - Code linting and style enforcement
- **Prettier** - Automatic code formatting
- **Husky** - Git hooks for pre-commit checks
- **lint-staged** - Run linters on staged files

### Code Style

- **Indentation**: Tabs (2-space display width)
- **Quotes**: Single quotes
- **Semicolons**: None
- **Line endings**: LF
- **Print width**: 120 characters

## 📋 Features

- Multi-language support with automatic fallback
- Cross-wiki gadget management
- User-friendly interface
- MediaWiki API integration
- Responsive design

## 🔧 Configuration

### ESLint

Configuration is in `eslint.config.js`. Rules enforce:

- Tab indentation
- Single quotes
- No semicolons
- Modern JavaScript practices

### Prettier

Configuration is in `.prettierrc`. Settings:

- Use tabs for indentation
- Single quotes
- No semicolons
- 120 character line width

### Git Hooks

- **pre-commit**: Runs ESLint and Prettier on staged files
- **pre-push**: Runs full linting and formatting checks

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 👥 Authors

- **Equazcion** - Original concept
- **Enterprisey** - Base implementation
- **Iniquity** - Refactoring and upgrades

## 📚 Documentation

For detailed development information, see [DEVELOPMENT.md](DEVELOPMENT.md).

---
