# Script Manager

A MediaWiki user script management system for managing and installing gadgets across different wikis.

## 📁 Project Structure

```
├── src/                         # Vite entry + modular runtime architecture
│   ├── App.js                   # Runtime entrypoint
│   ├── core/
│   │   └── scriptManagerCoreRuntime.js # Authoritative core runtime source
│   ├── components/              # Shared models/components (e.g. Import)
│   ├── services/                # Bootstrap, runtime adapters, domain services
│   ├── utils/                   # Shared utility helpers
│   ├── constants/               # Runtime constants
│   └── styles/                  # Style entry points
├── scr/
│   └── scriptManager.js         # Loader and initialization
├── dist/                        # Build output artifacts
│   ├── scriptManager-core.js
│   └── scriptManager.js
├── i18n/                        # Internationalization files
│   ├── en.json                  # English translations
│   └── ru.json                  # Russian translations
├── data/
│   └── languageFallbacks.json   # Language fallback mappings
├── .husky/                      # Git hooks
├── eslint.config.js             # ESLint configuration
└── package.json                 # Dependencies and scripts
```

## 🌍 Localization

All language files are located in the `i18n/` folder and named according to the language code (e.g., `ru.json`, `en.json`).

Localization is loaded automatically based on the user's MediaWiki language (`wgUserLanguage`).

Language files are loaded directly from Toolforge GitLab mirror:

```
https://gitlab.wikimedia.org/iniquity/script-manager/-/raw/main/i18n/{lang}.json
```

If the file for the selected language is missing, English (`en.json`) is used as a fallback.

## 🛠️ Development

### Prerequisites

- Node.js 22+
- npm 10+

### Installation

```bash
npm install
```

### Available Scripts

| Command                | Description               |
| ---------------------- | ------------------------- |
| `npm run lint`         | Run ESLint + Stylelint checks |
| `npm run lint:fix`     | Auto-fix ESLint + Stylelint issues |
| `npm run build:dev`    | Build development artifact bundle |
| `npm run build:prod`   | Build production artifact bundle |
| `npm run build`        | Run lint and both builds |

### Code Quality Tools

- **ESLint** - Code linting and style enforcement
- **Stylelint** - CSS linting for `src/`
- **Husky** - Git hooks for pre-commit checks
- **lint-staged** - Run linters on staged files

### Code Style

- **Indentation**: Tabs (2-space display width)
- **Quotes**: Single quotes
- **Semicolons**: Required
- **Line endings**: LF
- **Formatting source of truth**: `eslint.config.js`

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
- Semicolons
- Modern JavaScript practices

### Stylelint

Configuration is in `stylelint.config.js`. It validates CSS in `src/`.

### Git Hooks

- **pre-commit**: Runs ESLint on staged files
- **pre-push**: Runs full linting checks

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🔄 Repository Information

**GitLab is the primary repository** for this project.

- **Primary repository**: [GitLab](https://gitlab.wikimedia.org/iniquity/script-manager) (gitlab.wikimedia.org)
- **Development**: All development happens on GitLab
- **Issues & PRs**: Use GitLab for issues and merge requests
- **Mirror**: GitHub repository is a read-only mirror

## 👥 Authors

- **Equazcion** - Original concept
- **Enterprisey** - Base implementation
- **Iniquity** - Refactoring and upgrades

## 📚 Documentation

For detailed development information, see [DEVELOPMENT.md](DEVELOPMENT.md).

---
