# Wiki sync: Script Manager

Suggested edits for [Script_Manager](https://www.mediawiki.org/wiki/Script_Manager) so the public product page matches the current codebase (v1.6.7+). Copy sections into the wiki when publishing or after a release that changes user-visible behavior.

Last reviewed against the repository on 2026-08-21.

## Status vs current wiki

| Topic | Wiki (as of review) | Code / repo docs |
| --- | --- | --- |
| Recursive “Check loaded scripts” depth | depth 3 | Install dialog passes `maxDepth: 3` — OK |
| Snippet Install on code pages | not mentioned | Snippet buttons skipped when content model is JS/CSS |
| Settings version / publish date | not mentioned | Settings dialog shows version + build date |
| Gadget module loader URLs | not mentioned | Imports handle `load.php?modules=ext.gadget.*` |
| i18n hosting URL | not detailed | Toolforge GitLab content mirror |
| translatewiki | linked | OK |

## Suggested feature bullet updates

Replace or extend the existing bullets as follows.

### Install / snippets

Keep the existing Install/Uninstall locations list, and add:

* Snippet Install buttons are added under code blocks on documentation (wikitext) pages only. They are '''not''' added when the current page content model is JavaScript or CSS (the raw script page itself).

### Gadgets / imports

Add:

* '''Gadget module imports''' — Script Manager recognizes gadget module loads such as <code>mw.loader.load( 'ext.gadget.Name' )</code> and <code>load.php?modules=ext.gadget.Name</code> when listing and normalizing imports.

### Settings

Extend the Settings bullet:

* '''Settings''' — default tab (gadgets / all / skin) is stored per wiki; "Enable script interceptor" is stored globally (Meta). '''Enable script load caching via API''' — when on, inserts [[:en:User:SD0001/Making user scripts load faster|userscript load caching]] code at the top of your global.js on Meta (inside <code>// SM-LOAD-CACHING-START</code> / <code>// SM-LOAD-CACHING-END</code> markers); when off, removes that block. Stored and detected per global.js so the checkbox reflects existing code. The Settings dialog also shows the installed '''version''' and '''publish date''' of the loaded build.

## Suggested “Where Install/Uninstall links appear” note

Under '''Code snippets''', append:

: Snippet buttons are omitted on pages whose content model is JavaScript or CSS, so raw script source pages are not cluttered with Install controls meant for documentation.

## Suggested Development subsection

Keep GitLab as primary. Optional clarifying sentence:

: Repository docs for contributors (architecture, lint, tests, CI) live in the GitLab/GitHub tree: <code>README.md</code>, <code>DEVELOPMENT.md</code>.

## After applying

1. Bump or note the sync date in this file.
2. Prefer matching user-facing wording to `i18n/en.json` strings where the UI text is quoted.
3. Do not invent features that are not in `src/` / `scr/`.
