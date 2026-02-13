export function decodeSafe(value) {
	try {
		return decodeURIComponent(String(value || '').replace(/&$/, ''));
	} catch {
		return String(value || '');
	}
}
