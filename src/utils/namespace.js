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

	if (namespace.toLowerCase() === 'user') {
		return `User:${rest}`;
	}

	return title;
}
