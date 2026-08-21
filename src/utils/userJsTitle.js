export function getCurrentUserName() {
	return String(mw?.config?.get?.('wgUserName') || '').trim();
}

export function getUserJsTitle(target = 'common', userName = getCurrentUserName()) {
	const cleanUserName = String(userName || '').trim();
	if (!cleanUserName) {
		return null;
	}
	const cleanTarget = String(target || 'common').trim() || 'common';
	if (cleanTarget === 'global') {
		return `User:${cleanUserName}/global.js`;
	}
	return `User:${cleanUserName}/${cleanTarget}.js`;
}
