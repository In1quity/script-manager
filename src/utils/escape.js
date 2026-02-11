export function escapeForRegex(text) {
	return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function escapeForJsString(text) {
	return String(text || '')
		.replace(/\\/g, '\\\\')
		.replace(/'/g, '\\\'')
		.replace(/\r/g, '\\r')
		.replace(/\n/g, '\\n')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');
}

export function escapeForJsComment(text) {
	return String(text || '')
		.replace(/\\/g, '\\\\')
		.replace(/\r/g, '\\r')
		.replace(/\n/g, '\\n')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029')
		.replace(/\*\//g, '*\\/');
}

export function unescapeForJsString(text) {
	return String(text || '')
		.replace(/\\n/g, '\n')
		.replace(/\\r/g, '\r')
		.replace(/\\u2028/g, '\u2028')
		.replace(/\\u2029/g, '\u2029')
		.replace(/\\'/g, '\'')
		.replace(/\\\\/g, '\\');
}
