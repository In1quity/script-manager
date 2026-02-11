import languageFallbacks from '../../data/languageFallbacks.json';

const STRINGS = {};
let STRINGS_EN = typeof SM_I18N_EN !== 'undefined' ? SM_I18N_EN : {};

function getLanguageChain(lang) {
	const code = String(lang || 'en').toLowerCase();
	const chain = [ code ];
	const fallback = languageFallbacks?.[code];
	if (Array.isArray(fallback)) {
		chain.push(...fallback);
	}

	if (!chain.includes('en')) {
		chain.push('en');
	}

	return Array.from(new Set(chain));
}

async function fetchLanguage(lang) {
	const base =
		window.ScriptManagerI18nBaseUrl || 'https://gitlab-content.toolforge.org/iniquity/script-manager/-/raw/main/i18n';
	const response = await fetch(`${base}/${lang}.json`);
	if (!response.ok) {
		throw new Error(`Failed to load i18n: ${lang}`);
	}
	return response.json();
}

export async function loadI18n(lang) {
	const chain = getLanguageChain(lang);
	const merged = {};

	for (const code of chain) {
		try {
			const dict = await fetchLanguage(code);
			Object.assign(merged, dict);
			if (code === 'en') {
				STRINGS_EN = dict;
			}
		} catch {
			// Continue through fallback chain.
		}
	}

	Object.keys(STRINGS).forEach((key) => delete STRINGS[key]);
	Object.assign(STRINGS, merged);
	return STRINGS;
}

export function t(key, fallback = key) {
	return STRINGS[key] || STRINGS_EN[key] || fallback;
}

export function getStrings() {
	return {
		current: STRINGS,
		fallback: STRINGS_EN
	};
}
