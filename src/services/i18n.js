import languageFallbacks from '../../data/languageFallbacks.json';
import { createLogger } from '@utils/logger';
import { fetchWithTimeout } from '@utils/network';

const STRINGS = {};
let STRINGS_EN = typeof SM_I18N_EN !== 'undefined' ? SM_I18N_EN : {};
let STRINGS_SITE = {};
let ACTIVE_LANGUAGE = 'en';
let ACTIVE_SITE_LANGUAGE = 'en';
const logger = createLogger('service.i18n');

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
	const response = await fetchWithTimeout(`${base}/${lang}.json`);
	if (!response.ok) {
		throw new Error(`Failed to load i18n: ${lang}`);
	}
	return response.json();
}

async function loadSiteLanguage(siteLanguage, userLanguage) {
	const cleanSiteLanguage = String(siteLanguage || 'en').toLowerCase();
	ACTIVE_SITE_LANGUAGE = cleanSiteLanguage;
	if (!cleanSiteLanguage || cleanSiteLanguage === 'en' || cleanSiteLanguage === String(userLanguage || 'en').toLowerCase()) {
		STRINGS_SITE = {};
		return STRINGS_SITE;
	}

	try {
		STRINGS_SITE = await fetchLanguage(cleanSiteLanguage);
	} catch (error) {
		logger.warn(`Failed to load site language "${cleanSiteLanguage}"`, error);
		STRINGS_SITE = {};
	}

	return STRINGS_SITE;
}

export async function loadI18n(lang, options = {}) {
	const requestedLanguage = String(lang || 'en').toLowerCase();
	const chain = getLanguageChain(requestedLanguage);
	const merged = {};

	const bundledEn = typeof SM_I18N_EN !== 'undefined' ? SM_I18N_EN : {};

	for (const code of chain) {
		try {
			const dict = await fetchLanguage(code);
			if (code === 'en') {
				Object.assign(merged, bundledEn, dict);
				STRINGS_EN = Object.assign({}, bundledEn, dict);
			} else {
				Object.assign(merged, dict);
			}
		} catch (error) {
			logger.warn(`Failed to load language "${code}"`, error);
			if (code === 'en') {
				Object.assign(merged, bundledEn);
				STRINGS_EN = Object.assign({}, bundledEn);
			}
		}
	}

	Object.keys(STRINGS).forEach((key) => delete STRINGS[key]);
	Object.assign(STRINGS, merged);
	ACTIVE_LANGUAGE = requestedLanguage;

	const siteLanguage = options.siteLanguage || mw?.config?.get('wgContentLanguage') || 'en';
	await loadSiteLanguage(siteLanguage, requestedLanguage);

	return STRINGS;
}

export function t(key, fallback = key, options = {}) {
	if (options.useSiteLanguage && Object.prototype.hasOwnProperty.call(STRINGS_SITE, key)) {
		return STRINGS_SITE[key];
	}
	return STRINGS[key] || STRINGS_EN[key] || fallback;
}

export function getStrings() {
	return {
		current: STRINGS,
		fallback: STRINGS_EN,
		site: STRINGS_SITE,
		language: ACTIVE_LANGUAGE,
		siteLanguage: ACTIVE_SITE_LANGUAGE
	};
}
