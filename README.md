# Script Manager

MediaWiki user script manager for installing, moving, and organizing personal scripts and gadgets across skins and wikis.

**Product docs:** [Script Manager on mediawiki.org](https://www.mediawiki.org/wiki/Script_Manager)  
**Version:** see `package.json` (shown in Settings as version + publish date)

## Install (all Wikimedia wikis)

Add to your **global.js on Meta**:

```javascript
mw.loader.load( 'https://www.mediawiki.org/w/index.php?title=User:Iniquity/scriptManager.js&action=raw&ctype=text/javascript' ); // [[mw:Script Manager]]
```

The loader fetches the core from mediawiki.org. Open **Script Manager** in the toolbox to manage scripts and gadgets.

## Project structure

```
├── src/                          # Vite entry + modular runtime
│   ├── App.js                    # Runtime entrypoint
│   ├── components/               # Vue/Codex UI (panel, dialogs, install)
│   ├── services/                 # Bootstrap, imports, gadgets, settings, …
│   ├── utils/                    # Shared helpers
│   ├── constants/                # Runtime constants
│   └── styles/                   # Style entry points
├── scr/
│   ├── scriptManager.js          # Loader source
│   └── scriptManager-capture.js  # Capture wrapper source
├── dist/                         # Build output (gitignored)
│   ├── scriptManager-core.js     # Bundled Vue/Codex runtime
│   ├── scriptManager.js          # Loader (+ banner)
│   └── scriptManager-capture.js  # Capture script (+ banner)
├── i18n/                         # Message files (translatewiki.net)
├── data/
│   └── languageFallbacks.json    # Language fallback chain
├── .github/workflows/            # CI + release deploy
├── eslint.config.js
├── stylelint.config.js
├── vite.config.js
├── vitest.config.js
└── package.json
```

## Localization

Message files live in `i18n/` as `{lang}.json` (plus `qqq.json` for translator docs). Translations are maintained on [translatewiki.net](https://translatewiki.net/wiki/Translating:Script-manager).

Runtime loads messages from the Toolforge GitLab content mirror:

```
https://gitlab-content.toolforge.org/iniquity/script-manager/-/raw/main/i18n/{lang}.json
```

Language selection follows the user’s MediaWiki UI language (`wgUserLanguage`, with `uselang` override for the sidebar). Missing keys fall back through `data/languageFallbacks.json`, then to English (`en.json`, also bundled into the core build).

## Development

### Prerequisites

- Node.js 22+
- npm 10+

### Setup

```bash
npm install
```

### Scripts

| Command | Description |
| --- | --- |
| `npm run lint` | ESLint + Stylelint |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run test` | Vitest (watch) |
| `npm run test:run` | Vitest (single run) |
| `npm run build:dev` | Development bundle |
| `npm run build:prod` | Production bundle |
| `npm run build` | Lint, then both builds |

### Code quality

- **ESLint** (`@stylistic`) — formatting and JS rules
- **Stylelint** — CSS in `src/`
- **Vitest** + jsdom — unit tests under `src/**/*.test.js`
- **Husky** + **lint-staged** — pre-commit / pre-push gates
- **GitHub Actions** — lint + build on `main` / PRs; release assets on `v*` tags

### Code style

- Indentation: tabs
- Quotes: single
- Semicolons: required
- Line endings: LF (`.gitattributes`)
- Source of truth: `eslint.config.js` (not Prettier)

## Features

- **One-click install/uninstall** — user scripts, styles, and gadgets; install dialog shows name, optional source wiki, and a security warning.
- **Pre-install load check** — scans the script for network loads: notice for the current wiki, warning for other Wikimedia hosts, error for non-Wikimedia hosts. “Check loaded scripts” runs a recursive scan (depth 3) when the script loads other Wikimedia scripts.
- **Install controls on doc pages** — page indicator, `.scriptInstallerLink`, `infobox-user-script`, and Install buttons under `mw.loader.load` / `importScript` snippets (skipped on JS/CSS code pages).
- **Gadget module URLs** — recognizes `load.php?modules=ext.gadget.*` (and related module forms) when listing and normalizing imports.
- **Target management** — move between common, global, and skin pages (Vector 2022, Vector, Minerva, Monobook, Timeless).
- **Documentation link** — `// Documentation: Title`, JSDoc `@documentation Title`, or `@see Title` in the first 2000 characters.
- **Gadgets panel** — enable/disable with live state, sections, and search filter.
- **Script capture** — wrap selected scripts for sidebar access; capture UI when interceptor is on or the script is already captured.
- **Settings** — default tab (per wiki), script interceptor (global), load caching (per `global.js`); shows build version and publish date.
- **UI** — Vue 3 + Codex; multi-language with fallback chain.

## Configuration

### ESLint / Stylelint

See `eslint.config.js` and `stylelint.config.js`.

### Git hooks

- **pre-commit** — ESLint on staged `*.js` via lint-staged
- **pre-push** — full `npm run lint`

### CI

- `.github/workflows/ci.yml` — `npm ci`, lint, build, artifact presence check
- `.github/workflows/deploy.yml` — on `v*` tags: build and attach `dist/` assets to the GitHub Release

## License

MIT OR CC-BY-SA-4.0 — see [LICENSE](LICENSE) and `package.json`.

## Repository

**GitLab is the primary repository.**

- Primary: [GitLab](https://gitlab.wikimedia.org/iniquity/script-manager)
- Issues & merge requests: GitLab
- Mirror: [GitHub](https://github.com/In1quity/script-manager) (CI/releases also run here)

## Authors

- **Equazcion** — original concept
- **Enterprisey** — base implementation
- **Iniquity** — refactoring and upgrades

## More documentation

- User-facing: [mw:Script Manager](https://www.mediawiki.org/wiki/Script_Manager)
- Contributor guide: [DEVELOPMENT.md](DEVELOPMENT.md)
