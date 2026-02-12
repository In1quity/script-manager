import { DEFAULT_SKIN, SKINS } from '@constants/skins';
import { getApi } from '@services/api';
import { createLogger } from '@utils/logger';

const logger = createLogger('service.settings');

const SETTINGS_OPTION_KEY = 'userjs-sm-settings';
const DEFAULT_SETTINGS = Object.freeze({
	defaultTab: DEFAULT_SKIN
});

/** Valid values for defaultTab: gadgets, all, or any skin from SKINS */
const DEFAULT_TAB_VALUES = [ 'gadgets', 'all', ...SKINS ];

let settingsCache = { ...DEFAULT_SETTINGS };
let settingsLoaded = false;
let loadPromise = null;

function isValidDefaultTab(value) {
	return typeof value === 'string' && DEFAULT_TAB_VALUES.includes(value);
}

function normalizeSettings(value) {
	const normalized = { ...DEFAULT_SETTINGS };
	if (value && typeof value === 'object' && isValidDefaultTab(value.defaultTab)) {
		normalized.defaultTab = value.defaultTab;
	}
	return normalized;
}

function readRawSettings() {
	try {
		return mw?.user?.options?.get?.(SETTINGS_OPTION_KEY) || '';
	} catch {
		return '';
	}
}

function writeRawSettings(raw) {
	try {
		mw?.user?.options?.set?.(SETTINGS_OPTION_KEY, raw);
	} catch {
		// Ignore write errors in environments without mw.user.options.set.
	}
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

	loadPromise = Promise.resolve()
		.then(() => {
			const raw = readRawSettings();
			if (!raw) {
				settingsCache = { ...DEFAULT_SETTINGS };
				settingsLoaded = true;
				return getSettings();
			}

			try {
				const parsed = JSON.parse(raw);
				settingsCache = normalizeSettings(parsed);
			} catch (error) {
				logger.warn('Failed to parse settings, using defaults', error);
				settingsCache = { ...DEFAULT_SETTINGS };
			}

			settingsLoaded = true;
			return getSettings();
		})
		.finally(() => {
			loadPromise = null;
		});

	return loadPromise;
}

export function saveSettings(nextSettings) {
	const normalized = normalizeSettings(nextSettings);
	const raw = JSON.stringify(normalized);
	const api = getApi();

	if (!api || typeof api.saveOption !== 'function') {
		logger.warn('API not initialized, persisting settings locally only');
		settingsCache = normalized;
		settingsLoaded = true;
		writeRawSettings(raw);
		return Promise.resolve(getSettings());
	}

	return Promise.resolve(api.saveOption(SETTINGS_OPTION_KEY, raw)).then(() => {
		settingsCache = normalized;
		settingsLoaded = true;
		writeRawSettings(raw);
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
