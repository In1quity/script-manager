import { DEFAULT_SKIN, SKINS } from '@constants/skins';
import { SUMMARY_TAG } from '@constants/config';
import { getApi, getMetaApi } from '@services/api';
import { createLogger } from '@utils/logger';
import { fetchWithTimeout } from '@utils/network';
import { getWikitext } from '@utils/wikitext';

const logger = createLogger('service.settings');

const SETTINGS_OPTION_KEY = 'userjs-sm-settings';
const LOCAL_SETTINGS_OPTION_KEY = 'userjs-sm-settings-local';
const SETTINGS_SCHEME = Object.freeze({
	local: [ 'defaultTab' ]
});
const DEFAULT_SETTINGS = Object.freeze({
	defaultTab: DEFAULT_SKIN,
	captureEnabled: false,
	userscriptLoadCachingEnabled: false
});
const USERSCRIPT_LOAD_CACHING_SOURCE_TITLE = 'User:SD0001/userscript-load-caching.min.js';
const USERSCRIPT_LOAD_CACHING_PAGE_URL = 'https://en.wikipedia.org/wiki/User:SD0001/userscript-load-caching.min.js';
const USERSCRIPT_LOAD_CACHING_START = '// SM-LOAD-CACHING-START';
const USERSCRIPT_LOAD_CACHING_END = '// SM-LOAD-CACHING-END';
const USERSCRIPT_LOAD_CACHING_START_RGX = /^\s*\/\/\s*SM-LOAD-CACHING-START\b/;
const USERSCRIPT_LOAD_CACHING_END_RGX = /^\s*\/\/\s*SM-LOAD-CACHING-END\b/;
const USERSCRIPT_LOAD_CACHING_SIGNATURE_RGXES = [
	/SM-LOAD-CACHING-START/i,
	/userscript-load-caching\.min\.js/i,
	/Making[_ ]user[_ ]scripts[_ ]load[_ ]faster/i,
	/Enable caching for resource loads/i
];

/** Valid values for defaultTab: gadgets, all, or any skin from SKINS */
const DEFAULT_TAB_VALUES = [ 'gadgets', 'all', ...SKINS ];

let settingsCache = { ...DEFAULT_SETTINGS };
let settingsLoaded = false;
let loadPromise = null;

function isValidDefaultTab(value) {
	return typeof value === 'string' && DEFAULT_TAB_VALUES.includes(value);
}

function isValidCaptureEnabled(value) {
	return typeof value === 'boolean';
}

function isValidUserscriptLoadCachingEnabled(value) {
	return typeof value === 'boolean';
}

function normalizePartialSettings(value) {
	const normalized = {};
	if (value && typeof value === 'object') {
		if (isValidDefaultTab(value.defaultTab)) {
			normalized.defaultTab = value.defaultTab;
		}
		if (isValidCaptureEnabled(value.captureEnabled)) {
			normalized.captureEnabled = value.captureEnabled;
		}
		if (isValidUserscriptLoadCachingEnabled(value.userscriptLoadCachingEnabled)) {
			normalized.userscriptLoadCachingEnabled = value.userscriptLoadCachingEnabled;
		}
	}
	return normalized;
}

function normalizeSettings(value) {
	return {
		...DEFAULT_SETTINGS,
		...normalizePartialSettings(value)
	};
}

function isLocalSetting(name) {
	return SETTINGS_SCHEME.local.includes(name);
}

function pickLocalSettings(value) {
	return Object.keys(value || {}).reduce((acc, key) => {
		if (isLocalSetting(key)) {
			acc[key] = value[key];
		}
		return acc;
	}, {});
}

function pickGlobalSettings(value) {
	return Object.keys(value || {}).reduce((acc, key) => {
		if (!isLocalSetting(key)) {
			acc[key] = value[key];
		}
		return acc;
	}, {});
}

function parseRawSettings(raw, scope) {
	if (!raw) {
		return {};
	}
	try {
		return normalizePartialSettings(JSON.parse(raw));
	} catch (error) {
		logger.warn(`Failed to parse ${scope} settings, using defaults`, error);
		return {};
	}
}

function readLocalRawSettings() {
	try {
		return mw?.user?.options?.get?.(LOCAL_SETTINGS_OPTION_KEY) || '';
	} catch {
		return '';
	}
}

function readLegacyRawSettings() {
	try {
		return mw?.user?.options?.get?.(SETTINGS_OPTION_KEY) || '';
	} catch {
		return '';
	}
}

function writeLocalRawSettings(raw) {
	try {
		mw?.user?.options?.set?.(LOCAL_SETTINGS_OPTION_KEY, raw);
	} catch {
		// Ignore write errors in environments without mw.user.options.set.
	}
}

function writeLegacyRawSettings(raw) {
	try {
		mw?.user?.options?.set?.(SETTINGS_OPTION_KEY, raw);
	} catch {
		// Ignore write errors in environments without mw.user.options.set.
	}
}

async function readGlobalRawSettingsFromMeta() {
	const metaApi = getMetaApi();
	if (!metaApi || typeof metaApi.get !== 'function') {
		return '';
	}
	try {
		const response = await metaApi.get({
			action: 'query',
			meta: 'userinfo',
			uiprop: 'options'
		});
		const raw = response?.query?.userinfo?.options?.[SETTINGS_OPTION_KEY];
		return typeof raw === 'string' ? raw : '';
	} catch (error) {
		logger.warn('Failed to read global settings from meta, fallback to local cache', error);
		return '';
	}
}

function saveOptionRaw(api, optionKey, raw) {
	if (!api) {
		return Promise.resolve();
	}
	if (typeof api.saveOption === 'function') {
		return Promise.resolve(api.saveOption(optionKey, raw));
	}
	if (typeof api.postWithToken === 'function') {
		return Promise.resolve(
			api.postWithToken('csrf', {
				action: 'options',
				optionname: optionKey,
				optionvalue: raw
			})
		);
	}
	return Promise.reject(new Error(`API does not support saving option "${optionKey}"`));
}

function syncGlobalCacheToLocal(api, globalRaw) {
	if (!api || typeof globalRaw !== 'string') {
		return Promise.resolve();
	}
	return saveOptionRaw(api, SETTINGS_OPTION_KEY, globalRaw).catch((error) => {
		logger.warn('Failed to sync global settings cache to local wiki option', error);
	});
}

function getGlobalJsTitle() {
	try {
		const userName = mw?.config?.get?.('wgUserName') || '';
		return userName ? `User:${userName}/global.js` : null;
	} catch {
		return null;
	}
}

function stripUserscriptLoadCachingBlock(text) {
	const lines = String(text || '').split('\n');
	const out = [];
	let insideBlock = false;
	lines.forEach((line) => {
		if (!insideBlock && USERSCRIPT_LOAD_CACHING_START_RGX.test(line)) {
			insideBlock = true;
			return;
		}
		if (insideBlock && USERSCRIPT_LOAD_CACHING_END_RGX.test(line)) {
			insideBlock = false;
			return;
		}
		if (!insideBlock) {
			out.push(line);
		}
	});
	return out.join('\n');
}

function removeUserscriptLoadCachingSource(text, sourceCode) {
	const base = String(text || '');
	const code = String(sourceCode || '').trim();
	if (!base || !code) {
		return base;
	}

	let next = base;
	// Try exact removal first (with and without surrounding newlines).
	next = next.replace(code, '');
	next = next.replace(`\n${code}\n`, '\n');
	next = next.replace(`\r\n${code}\r\n`, '\r\n');
	next = next.replace(`\n${code}`, '\n');
	next = next.replace(`${code}\n`, '\n');

	// Normalize accidental excessive blank lines left after removal.
	next = next.replace(/\n{3,}/g, '\n\n').replace(/^\s*\n+/, '');
	return next;
}

function buildUserscriptLoadCachingBlock(code) {
	const safeCode = String(code || '').trimEnd();
	return [
		USERSCRIPT_LOAD_CACHING_START,
		`// Source: ${USERSCRIPT_LOAD_CACHING_PAGE_URL}`,
		safeCode,
		USERSCRIPT_LOAD_CACHING_END
	].join('\n');
}

async function fetchUserscriptLoadCachingCode() {
	const response = await fetchWithTimeout(
		'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&origin=*' +
			`&prop=revisions&rvprop=content&rvslots=main&titles=${encodeURIComponent(USERSCRIPT_LOAD_CACHING_SOURCE_TITLE)}`
	);
	if (!response.ok) {
		throw new Error(`Failed to fetch load caching source: HTTP ${response.status}`);
	}
	const data = await response.json();
	const code = data?.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content || '';
	if (!String(code || '').trim()) {
		throw new Error('Load caching script source is empty');
	}
	return String(code).trimEnd();
}

async function syncUserscriptLoadCachingInGlobalJs(enabled) {
	const title = getGlobalJsTitle();
	const metaApi = getMetaApi();
	if (!title || !metaApi) {
		throw new Error('Meta API or global.js title is unavailable');
	}

	const current = String((await getWikitext(metaApi, title)) || '');
	let stripped = stripUserscriptLoadCachingBlock(current).replace(/^\s*\n+/, '');
	let next = stripped;

	if (enabled) {
		const sourceCode = await fetchUserscriptLoadCachingCode();
		const block = buildUserscriptLoadCachingBlock(sourceCode);
		next = stripped ? `${block}\n\n${stripped}` : `${block}\n`;
	} else {
		// Backward compatibility: remove raw source even if it was inserted without SM markers.
		try {
			const sourceCode = await fetchUserscriptLoadCachingCode();
			stripped = removeUserscriptLoadCachingSource(stripped, sourceCode).replace(/^\s*\n+/, '');
			next = stripped;
		} catch (error) {
			logger.warn('Failed to fetch load caching source for unwrapped cleanup', error);
		}
	}

	if (next === current) {
		return false;
	}

	const actionText = enabled ? 'Enable userscript load caching via API' : 'Disable userscript load caching via API';
	const summary = SUMMARY_TAG ? `${actionText} ${SUMMARY_TAG}` : actionText;
	try {
		await metaApi.postWithEditToken({
			action: 'edit',
			title,
			text: next,
			summary,
			formatversion: 2
		});
	} catch (error) {
		logger.error('Failed to update userscript load caching in global.js', error);
		throw error;
	}

	return true;
}

async function detectUserscriptLoadCachingInGlobalJs() {
	const title = getGlobalJsTitle();
	const metaApi = getMetaApi();
	if (!title || !metaApi) {
		return null;
	}
	try {
		const current = String((await getWikitext(metaApi, title)) || '');
		const detected = USERSCRIPT_LOAD_CACHING_SIGNATURE_RGXES.some((rgx) => rgx.test(current));
		return detected;
	} catch (error) {
		logger.warn('Failed to detect userscript load caching code in global.js', error);
		return null;
	}
}

function getSettings() {
	return { ...settingsCache };
}

export function getSetting(key, fallback = null) {
	if (!Object.prototype.hasOwnProperty.call(settingsCache, key)) {
		return fallback;
	}
	return settingsCache[key];
}

export function loadSettings(force = false) {
	if (settingsLoaded && !force) {
		return Promise.resolve(getSettings());
	}
	if (loadPromise && !force) {
		return loadPromise;
	}

	loadPromise = Promise.all([
		Promise.resolve(readLocalRawSettings()),
		readGlobalRawSettingsFromMeta(),
		Promise.resolve(readLegacyRawSettings()),
		detectUserscriptLoadCachingInGlobalJs()
	])
		.then(([ localRaw, globalRaw, legacyRaw, userscriptLoadCachingDetected ]) => {
			const localSettings = localRaw ? pickLocalSettings(parseRawSettings(localRaw, 'local')) : {};
			const globalSettings = globalRaw ? pickGlobalSettings(parseRawSettings(globalRaw, 'global')) : {};
			if ((!localRaw || !globalRaw) && legacyRaw) {
				const legacySettings = parseRawSettings(legacyRaw, 'legacy');
				if (!localRaw) {
					Object.assign(localSettings, pickLocalSettings(legacySettings));
				}
				if (!globalRaw) {
					Object.assign(globalSettings, pickGlobalSettings(legacySettings));
				}
			}
			settingsCache = normalizeSettings(Object.assign({}, globalSettings, localSettings));
			if (typeof userscriptLoadCachingDetected === 'boolean') {
				settingsCache.userscriptLoadCachingEnabled = userscriptLoadCachingDetected;

			}
			settingsLoaded = true;
			// Keep in-memory mw.user.options cache aligned for current page runtime.
			writeLocalRawSettings(JSON.stringify(localSettings));
			writeLegacyRawSettings(JSON.stringify(globalSettings));
			const api = getApi();
			if (globalRaw && api && globalRaw !== legacyRaw) {
				// Loader reads this option synchronously before app boot.
				void syncGlobalCacheToLocal(api, globalRaw);
			}
			return getSettings();
		})
		.finally(() => {
			loadPromise = null;
		});

	return loadPromise;
}

export function saveSettings(nextSettings) {
	const normalized = normalizeSettings(nextSettings);
	const prevUserscriptLoadCachingEnabled = settingsCache.userscriptLoadCachingEnabled === true;
	const nextUserscriptLoadCachingEnabled = normalized.userscriptLoadCachingEnabled === true;
	const localSettings = pickLocalSettings(normalized);
	const globalSettings = pickGlobalSettings(normalized);
	const localRaw = JSON.stringify(localSettings);
	const globalRaw = JSON.stringify(globalSettings);
	const api = getApi();
	const metaApi = getMetaApi();

	if (!api && !metaApi) {
		logger.warn('APIs not initialized, persisting settings in memory only');
		settingsCache = normalized;
		settingsLoaded = true;
		writeLocalRawSettings(localRaw);
		writeLegacyRawSettings(globalRaw);
		return Promise.resolve(getSettings());
	}

	const localSavePromise = api ? saveOptionRaw(api, LOCAL_SETTINGS_OPTION_KEY, localRaw) : Promise.resolve();
	const globalSavePromise = metaApi ?
		saveOptionRaw(metaApi, SETTINGS_OPTION_KEY, globalRaw) :
		Promise.resolve().then(() => {
			if (!api) {
				return;
			}
			logger.warn('Meta API is not initialized, saving global settings to local wiki as fallback');
			return saveOptionRaw(api, SETTINGS_OPTION_KEY, globalRaw);
		});
	const cacheSyncPromise = syncGlobalCacheToLocal(api, globalRaw);
	const userscriptLoadCachingPromise =
		prevUserscriptLoadCachingEnabled !== nextUserscriptLoadCachingEnabled ?
			syncUserscriptLoadCachingInGlobalJs(nextUserscriptLoadCachingEnabled) :
			Promise.resolve(false);

	return Promise.all([ localSavePromise, globalSavePromise, cacheSyncPromise, userscriptLoadCachingPromise ]).then(() => {
		settingsCache = normalized;
		settingsLoaded = true;
		writeLocalRawSettings(localRaw);
		writeLegacyRawSettings(globalRaw);
		return getSettings();
	});
}
