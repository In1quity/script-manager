import { getApi } from '@services/api';

let gadgetsData = {};
let userGadgetSettings = {};

export async function loadGadgets() {
	const api = getApi();
	if (!api) {
		return gadgetsData;
	}

	try {
		const response = await api.get({
			action: 'query',
			meta: 'siteinfo',
			siprop: 'general'
		});
		gadgetsData = response || {};
	} catch {
		gadgetsData = {};
	}

	return gadgetsData;
}

export async function loadUserGadgetSettings() {
	const api = getApi();
	if (!api) {
		return userGadgetSettings;
	}

	try {
		const response = await api.get({
			action: 'query',
			meta: 'userinfo',
			uiprop: 'options'
		});
		userGadgetSettings = response?.query?.userinfo?.options || {};
	} catch {
		userGadgetSettings = {};
	}

	return userGadgetSettings;
}

export function getGadgetsData() {
	return gadgetsData;
}

export function getUserGadgetSettings() {
	return userGadgetSettings;
}
