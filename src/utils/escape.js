export function escapeForRegex(text) {
	return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function escapeForJsString(text) {
	return String(text || '')
		.replace(/\\/g, '\\\\')
		.replace(/'/g, '\\\'')
		.replace(/\r/g, '\\r')
		.replace(/\n/g, '\\n');
}

export function escapeForJsComment(text) {
	return String(text || '').replace(/\*\//g, '*\\/');
}

export function unescapeForJsString(text) {
	return String(text || '')
		.replace(/\\n/g, '\n')
		.replace(/\\r/g, '\r')
		.replace(/\\'/g, '\'')
		.replace(/\\\\/g, '\\');
}
