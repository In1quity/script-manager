import { DEFAULT_SKIN, SKINS } from '@constants/skins';

export function getFullTarget(target) {
	const cleanTarget = target || DEFAULT_SKIN;
	return `User:${mw.config.get('wgUserName')}/${cleanTarget}.js`;
}

export function getSummaryForTarget(target, action = 'update') {
	const skin = target || DEFAULT_SKIN;
	return `${action} script import (${skin})`;
}

export function getTargetsForScript(scriptName, importsByTarget) {
	const map = importsByTarget || {};
	return SKINS.filter((target) =>
		Array.isArray(map[target]) &&
		map[target].some((item) => item?.page && String(item.page).toLowerCase() === String(scriptName).toLowerCase())
	);
}
