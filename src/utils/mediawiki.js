export function getMwConfig(key, fallback = '') {
	try {
		const value = mw?.config?.get?.(key);
		return value ?? fallback;
	} catch {
		return fallback;
	}
}

export function getUserName() {
	return String(getMwConfig('wgUserName', '') || '');
}

export function getServerName() {
	return String(getMwConfig('wgServerName', '') || '');
}

export function getUserNamespaceName() {
	const userNamespace = getMwConfig('wgFormattedNamespaces', {})?.[2];
	return userNamespace || 'User';
}

export function normalizeMediaWikiHost(host) {
	const cleanHost = String(host || '')
		.trim()
		.replace(/^https?:\/\//i, '')
		.replace(/\/.*$/, '');
	if (cleanHost.toLowerCase() === 'mediawiki.org') {
		return 'www.mediawiki.org';
	}
	return cleanHost;
}

export function normalizeSourceWiki(value) {
	return String(value || '')
		.trim()
		.replace(/^https?:\/\//i, '')
		.replace(/\/.*$/, '')
		.replace(/\.org$/i, '')
		.replace(/^www\./i, '');
}

export function getCurrentSourceWiki() {
	return normalizeSourceWiki(getServerName());
}

export function extractSourceWikiFromUrl(url) {
	const normalized = normalizeSourceWiki(url);
	if (normalized) {
		return normalized;
	}
	try {
		const parsed = new URL(String(url || ''), window.location.href);
		return normalizeSourceWiki(parsed.hostname || '');
	} catch {
		return '';
	}
}
