export function filterScriptsByText(scripts, query) {
	const text = String(query || '').trim().toLowerCase();
	if (!text) {
		return scripts;
	}

	return scripts.filter((item) => String(item?.page || '').toLowerCase().includes(text));
}
