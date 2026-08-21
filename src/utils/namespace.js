import { getUserNamespaceName } from '@utils/mediawiki';

export function canonicalizeUserNamespace(pageTitle) {
	const title = String(pageTitle || '').trim();
	if (!title) {
		return title;
	}

	const parts = title.split(':');
	if (parts.length < 2) {
		return title;
	}

	const namespace = parts.shift();
	const rest = parts.join(':');
	if (!namespace) {
		return title;
	}

	const namespaceLower = namespace.toLowerCase();
	const localizedUserNs = String(getUserNamespaceName() || 'User').toLowerCase();
	if (namespaceLower === 'user' || namespaceLower === localizedUserNs) {
		return `User:${rest}`;
	}

	return title;
}
