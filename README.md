# Script Manager

## Project Structure

- `scriptManager-core.js` — main script
- `scriptManager.js` — loader
- `scriptManager-core.css` — styles
- `i18n/` — all language files (JSON)

## Localization

All language files must be placed in the `i18n` folder and named according to the language code (e.g., `ru.json`, `en.json`).

Localization is loaded automatically based on the user's MediaWiki language (`wgUserLanguage`).

Localization files are loaded directly from GitLab:

```
https://gitlab.wikimedia.org/iniquity/script-manager/-/raw/main/i18n/{lang}.json
```

If the file for the selected language is missing, English (`en.json`) is used as a fallback.

## Build, Lint, and Format

(see `package.json`, `.eslintrc.json`, `.prettierrc`)

---
