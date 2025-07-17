# Gadget Script Installer

## Project Structure

- `Gadget-script-installer-core.js` — main script
- `Gadget-script-installer.js` — loader
- `Gadget-script-installer-core.css` — styles
- `i18n/` — all language files (JSON)

## Localization

All language files must be placed in the `i18n` folder and named according to the language code (e.g., `ru.json`, `en.json`).

Localization is loaded automatically based on the user's MediaWiki language (`wgUserLanguage`).

Localization files are loaded directly from GitLab:
```
https://gitlab.wikimedia.org/iniquity/script-installer/-/raw/main/i18n/{lang}.json
```
If the file for the selected language is missing, English (`en.json`) is used as a fallback.

## Build, Lint, and Format
(see `package.json`, `.eslintrc.json`, `.prettierrc`)

--- 