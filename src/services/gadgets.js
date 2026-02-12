import { getApi } from '@services/api';

let gadgetsData = {};
let userGadgetSettings = {};
let enabledGadgets = {};
let enabledGadgetsLoaded = false;
let gadgetSectionOrder = [];
let gadgetSectionLabels = {};
let gadgetsLabel = 'Gadgets';

let loadGadgetsPromise = null;
let loadSectionLabelsPromise = null;
let loadGadgetsLabelPromise = null;
let loadUserSettingsPromise = null;
let loadEnabledGadgetsPromise = null;

export async function loadGadgets() {
	if (loadGadgetsPromise) {
		return loadGadgetsPromise;
	}

	const api = getApi();
	if (!api) {
		return gadgetsData;
	}

	loadGadgetsPromise = Promise.resolve(
		api.get({
			action: 'query',
			list: 'gadgets',
			gaprop: 'id|desc|metadata',
			format: 'json'
		})
	)
		.then((response) => {
			const list = response?.query?.gadgets || [];
			const nextData = {};
			const sectionMap = Object.create(null);

			list.forEach((gadget) => {
				const settings = gadget?.metadata?.settings || {};
				if (Object.prototype.hasOwnProperty.call(settings, 'hidden')) {
					return;
				}

				const section = settings.section || 'other';
				if (!sectionMap[section]) {
					sectionMap[section] = true;
				}

				nextData[gadget.id] = {
					name: gadget.id,
					description: gadget.desc || '',
					section,
					isDefault: settings.default === ''
				};
			});

			gadgetsData = nextData;
			gadgetSectionOrder = Object.keys(sectionMap);
			return gadgetsData;
		})
		.catch(() => {
			gadgetsData = {};
			gadgetSectionOrder = [];
			return gadgetsData;
		})
		.finally(() => {
			loadGadgetsPromise = null;
		});

	return loadGadgetsPromise;
}

export async function loadGadgetsLabel() {
	if (loadGadgetsLabelPromise) {
		return loadGadgetsLabelPromise;
	}

	const api = getApi();
	if (!api) {
		return gadgetsLabel;
	}

	loadGadgetsLabelPromise = Promise.resolve(
		api.get({
			action: 'query',
			meta: 'allmessages',
			ammessages: 'prefs-gadgets',
			format: 'json'
		})
	)
		.then((response) => {
			const value = response?.query?.allmessages?.[0]?.['*'];
			gadgetsLabel = value || 'Gadgets';
			return gadgetsLabel;
		})
		.catch(() => {
			gadgetsLabel = 'Gadgets';
			return gadgetsLabel;
		})
		.finally(() => {
			loadGadgetsLabelPromise = null;
		});

	return loadGadgetsLabelPromise;
}

export async function loadSectionLabels() {
	if (loadSectionLabelsPromise) {
		return loadSectionLabelsPromise;
	}

	const api = getApi();
	if (!api) {
		return gadgetSectionLabels;
	}

	const sections = Array.from(
		new Set(
			Object.values(gadgetsData)
				.map((gadget) => gadget?.section)
				.filter((section) => section && section !== 'other')
		)
	);
	if (!sections.length) {
		gadgetSectionLabels = {};
		return gadgetSectionLabels;
	}

	const keys = sections.map((section) => `gadget-section-${section}`);
	loadSectionLabelsPromise = Promise.resolve(
		api.get({
			action: 'query',
			meta: 'allmessages',
			ammessages: keys.join('|'),
			format: 'json'
		})
	)
		.then((response) => {
			const out = {};
			const items = response?.query?.allmessages || [];
			items.forEach((entry) => {
				const name = entry?.name || '';
				const section = name.replace(/^gadget-section-/, '');
				const text = typeof entry?.['*'] === 'string' ? entry['*'].trim() : '';
				if (section) {
					out[section] = text || section.charAt(0).toUpperCase() + section.slice(1);
				}
			});
			sections.forEach((section) => {
				if (!out[section]) {
					out[section] = section.charAt(0).toUpperCase() + section.slice(1);
				}
			});
			gadgetSectionLabels = out;
			return gadgetSectionLabels;
		})
		.catch(() => {
			const fallback = {};
			sections.forEach((section) => {
				fallback[section] = section.charAt(0).toUpperCase() + section.slice(1);
			});
			gadgetSectionLabels = fallback;
			return gadgetSectionLabels;
		})
		.finally(() => {
			loadSectionLabelsPromise = null;
		});

	return loadSectionLabelsPromise;
}

export function applyGadgetLabels(sectionLabels = {}, tabLabel = gadgetsLabel) {
	gadgetSectionLabels = {
		...gadgetSectionLabels,
		...(sectionLabels || {})
	};
	if (tabLabel) {
		gadgetsLabel = tabLabel;
	}
	return {
		sectionLabels: gadgetSectionLabels,
		label: gadgetsLabel
	};
}

export async function loadUserGadgetSettings() {
	if (loadUserSettingsPromise) {
		return loadUserSettingsPromise;
	}

	const api = getApi();
	if (!api) {
		return userGadgetSettings;
	}

	loadUserSettingsPromise = Promise.resolve(
		api.get({
			action: 'query',
			meta: 'userinfo',
			uiprop: 'options'
		})
	)
		.then((response) => {
			const options = response?.query?.userinfo?.options || {};
			const next = {};
			Object.keys(options).forEach((key) => {
				if (key.startsWith('gadget-')) {
					next[key] = options[key];
				}
			});
			userGadgetSettings = next;
			return userGadgetSettings;
		})
		.catch(() => {
			userGadgetSettings = {};
			return userGadgetSettings;
		})
		.finally(() => {
			loadUserSettingsPromise = null;
		});

	return loadUserSettingsPromise;
}

export async function loadEnabledGadgets() {
	if (loadEnabledGadgetsPromise) {
		return loadEnabledGadgetsPromise;
	}

	const api = getApi();
	if (!api) {
		enabledGadgetsLoaded = false;
		return enabledGadgets;
	}

	loadEnabledGadgetsPromise = Promise.resolve(
		api.get({
			action: 'query',
			list: 'gadgets',
			gaprop: 'id',
			gaenabledonly: true,
			format: 'json'
		})
	)
		.then((response) => {
			const next = {};
			const list = response?.query?.gadgets || [];
			list.forEach((gadget) => {
				if (gadget?.id) {
					next[gadget.id] = true;
				}
			});
			enabledGadgets = next;
			enabledGadgetsLoaded = true;
			return enabledGadgets;
		})
		.catch(() => {
			enabledGadgets = {};
			enabledGadgetsLoaded = false;
			return enabledGadgets;
		})
		.finally(() => {
			loadEnabledGadgetsPromise = null;
		});

	return loadEnabledGadgetsPromise;
}

export async function toggleGadget(gadgetName, enabled) {
	const api = getApi();
	if (!api || !gadgetName) {
		return false;
	}

	await api.postWithToken('csrf', {
		action: 'options',
		optionname: `gadget-${gadgetName}`,
		optionvalue: enabled ? '1' : '0'
	});
	userGadgetSettings[`gadget-${gadgetName}`] = enabled ? '1' : '0';
	enabledGadgetsLoaded = true;
	if (enabled) {
		enabledGadgets[gadgetName] = true;
	} else {
		delete enabledGadgets[gadgetName];
	}
	return true;
}

export function getGadgetsData() {
	return gadgetsData;
}

export function getUserGadgetSettings() {
	return userGadgetSettings;
}

export function getEnabledGadgets() {
	return enabledGadgets;
}

export function isEnabledGadgetsLoaded() {
	return enabledGadgetsLoaded;
}

export function getGadgetsLabel() {
	return gadgetsLabel;
}

export function getGadgetSectionLabels() {
	return gadgetSectionLabels;
}

export function getGadgetSectionOrder() {
	return gadgetSectionOrder.slice();
}
