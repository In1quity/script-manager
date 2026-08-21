# Script Manager

MediaWiki user script manager for installing, moving, and organizing personal scripts and gadgets across skins and wikis.

**Product docs:** [Script Manager on mediawiki.org](https://www.mediawiki.org/wiki/Script_Manager)

## Install (all Wikimedia wikis)

Add to your **global.js on Meta**:

```javascript
mw.loader.load( 'https://www.mediawiki.org/w/index.php?title=User:Iniquity/scriptManager.js&action=raw&ctype=text/javascript' ); // [[mw:Script Manager]]
```

Open **Script Manager** in the toolbox to manage scripts and gadgets.

## Project Structure

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
├── dist/                         # Build output artifacts
│   ├── scriptManager-core.js     # Bundled Vue/Codex runtime
│   ├── scriptManager.js          # Loader (+ banner)
│   └── scriptManager-capture.js  # Capture script (+ banner)
├── i18n/                         # Message files (translatewiki.net)
│   ├── en.json
│   ├── ru.json
│   └── qqq.json
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

Runtime loads translations from:

```
https://gitlab-content.toolforge.org/iniquity/script-manager/-/raw/main/i18n/{lang}.json
```

Missing keys fall back via `data/languageFallbacks.json` to English (`en.json`).

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
| `npm run build` | Lint + production build |

### Git hooks

- **pre-commit** — lint-staged
- **pre-push** — `npm run lint` + `npm run test:run`

## Features

- One-click install/uninstall for scripts, styles, and gadgets.
- Network risk scan before install, including deep check for loaded Wikimedia scripts.
- Install controls on script docs, infoboxes, and code snippets.
- Move scripts between common/global/skin targets.
- Gadget management with live enable/disable state.
- Script capture flow for sidebar quick access.
- Settings for default tab, interceptor, and load caching.

## License

MIT OR CC-BY-SA-4.0 — see [LICENSE](LICENSE) and `package.json`.

## Repository

**GitLab is the primary repository.**

- Primary: [GitLab](https://gitlab.wikimedia.org/iniquity/script-manager)
- Mirror: [GitHub](https://github.com/In1quity/script-manager)
