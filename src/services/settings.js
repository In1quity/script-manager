import { DEFAULT_SKIN, SKINS } from '@constants/skins';
import { getApi, getMetaApi } from '@services/api';
import { createLogger } from '@utils/logger';

const logger = createLogger('service.settings');

const SETTINGS_OPTION_KEY = 'userjs-sm-settings';
const LOCAL_SETTINGS_OPTION_KEY = 'userjs-sm-settings-local';
const SETTINGS_SCHEME = Object.freeze({
	local: [ 'defaultTab' ]
});
const DEFAULT_SETTINGS = Object.freeze({
	defaultTab: DEFAULT_SKIN,
	captureEnabled: false
});

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

function normalizePartialSettings(value) {
	const normalized = {};
	if (value && typeof value === 'object') {
		if (isValidDefaultTab(value.defaultTab)) {
			normalized.defaultTab = value.defaultTab;
		}
		if (isValidCaptureEnabled(value.captureEnabled)) {
			normalized.captureEnabled = value.captureEnabled;
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

export function getDefaultSettings() {
	return { ...DEFAULT_SETTINGS };
}

export function getSettings() {
	return { ...settingsCache };
}

export function getSetting(key, fallback = null) {
	if (!Object.prototype.hasOwnProperty.call(settingsCache, key)) {
		return fallback;
	}
	return settingsCache[key];
}

export function isSettingsLoaded() {
	return settingsLoaded;
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
		Promise.resolve(readLegacyRawSettings())
	])
		.then(([ localRaw, globalRaw, legacyRaw ]) => {
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

	return Promise.all([ localSavePromise, globalSavePromise, cacheSyncPromise ]).then(() => {
		settingsCache = normalized;
		settingsLoaded = true;
		writeLocalRawSettings(localRaw);
		writeLegacyRawSettings(globalRaw);
		return getSettings();
	});
}

export function setSetting(key, value) {
	const next = {
		...settingsCache,
		[key]: value
	};
	return saveSettings(next);
}
