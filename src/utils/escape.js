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
	const source = String(text || '');
	let result = '';
	for (let index = 0; index < source.length; index++) {
		const char = source[index];
		if (char !== '\\') {
			result += char;
			continue;
		}

		const next = source[index + 1];
		if (next === 'n') {
			result += '\n';
			index++;
			continue;
		}
		if (next === 'r') {
			result += '\r';
			index++;
			continue;
		}
		if (next === '\'') {
			result += '\'';
			index++;
			continue;
		}
		if (next === '\\') {
			result += '\\';
			index++;
			continue;
		}
		if (next === 'u') {
			const code = source.slice(index + 2, index + 6);
			if (code === '2028' || code === '2029') {
				result += String.fromCharCode(Number.parseInt(code, 16));
				index += 5;
				continue;
			}
		}

		result += char;
	}
	return result;
}
