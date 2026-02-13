# Script Manager

A MediaWiki user script management system for managing and installing gadgets across different wikis. Full documentation: [Script Manager on mediawiki.org](https://www.mediawiki.org/wiki/Script_Manager).

### Install (all Wikimedia wikis)

Add to your **global.js on Meta**:

```javascript
mw.loader.load( 'https://www.mediawiki.org/w/index.php?title=User:Iniquity/scriptManager.js&action=raw&ctype=text/javascript' ); // [[mw:Script Manager]]
```

The loader fetches the core from mediawiki.org; open “Script Manager” in the toolbox to manage scripts and gadgets.

## 📁 Project Structure

```
├── src/                         # Vite entry + modular runtime architecture
│   ├── App.js                   # Runtime entrypoint
│   ├── components/              # Vue UI blocks (panel, dialogs, install button)
│   ├── services/                # Bootstrap + domain/runtime orchestration
│   │   ├── coreRuntime.js       # Initializes UI runtime without legacy bridge
│   │   ├── pageUi.js            # Page-level UI wiring (heading, indicators, links)
│   │   ├── summaryBuilder.js    # Summary/interwiki helpers for edits
│   │   └── uiOrchestrator.js    # UI open/attach orchestration layer
│   ├── utils/                   # Shared utility helpers
│   ├── constants/               # Runtime constants
│   └── styles/                  # Style entry points
├── scr/
│   ├── scriptManager.js         # Loader and initialization
│   └── scriptManager-capture.js # Capture wrapper (copied to dist with banner)
├── dist/                        # Build output artifacts
│   ├── scriptManager-core.js   # Bundled Vue/Codex runtime
│   ├── scriptManager.js        # Loader (from scr/)
│   └── scriptManager-capture.js # Capture script (from scr/)
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

- **One-click install/uninstall** — manage user scripts, styles, and gadgets; install dialog shows script name, optional source wiki, and security warning.
- **Install button on snippets** — on script doc pages, code blocks with `mw.loader.load`/`importScript` get an Install button below them.
- **Target management** — move scripts between common, global, and skin-specific pages.
- **Documentation link** — scripts can declare a doc page via `// Documentation: Title`, JSDoc `@documentation Title`, or `@see Title` (first 2000 chars).
- **Gadgets panel** — enable/disable gadgets with live state and section grouping.
- **Script capture** — wrap selected scripts for quick access in the sidebar; capture button visible when “Enable script interceptor” is on or script is captured.
- **Settings** — default tab (per wiki), script interceptor (global), load caching (per global.js); short headings for each group.
- Multi-language support with automatic fallback; Vue 3 + Codex UI; multi-skin support (Vector 2022, Vector, Minerva, Monobook, Timeless).

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

MIT OR CC-BY-SA-4.0 — see [LICENSE](LICENSE) and `package.json` for details.

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
