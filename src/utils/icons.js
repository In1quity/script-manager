export function loadCodexIconViaApi(iconName) {
	const keyRaw = `SM_ICON_RAW_${iconName}`;
	let cached = null;
	try {
		cached = localStorage.getItem(keyRaw);
	} catch {
		cached = null;
	}
	if (cached) {
		return Promise.resolve(cached);
	}

	const url =
		'https://www.mediawiki.org/w/api.php?action=query&format=json&formatversion=2&origin=*' +
		`&list=codexicons&names=${encodeURIComponent(iconName)}`;

	return fetch(url)
		.then((response) => response.json())
		.then((data) => {
			const codexIcons = data?.query?.codexicons;
			let raw = null;
			if (Array.isArray(codexIcons)) {
				const item = codexIcons[0] || null;
				raw = item && (item.icon || item.svg || item.value || null);
			} else if (codexIcons && typeof codexIcons === 'object') {
				raw = codexIcons[iconName] || null;
			}
			try {
				if (typeof raw === 'string') {
					localStorage.setItem(keyRaw, raw);
				}
			} catch {
				// Ignore localStorage write errors in private mode.
			}
			return raw;
		})
		.catch(() => null);
}

export function renderIconInto(element, iconName, colorHex = 'currentColor', sizePx = 16) {
	if (!element) {
		return;
	}

	const keyMarkup = `SM_ICON_MARKUP_${iconName}_${colorHex || ''}_${sizePx || ''}`;
	try {
		const cachedMarkup = localStorage.getItem(keyMarkup);
		if (cachedMarkup) {
			element.innerHTML = cachedMarkup;
			return;
		}
	} catch {
		// Ignore localStorage read errors in private mode.
	}

	void loadCodexIconViaApi(iconName).then((raw) => {
		if (!raw || !element) {
			return;
		}

		let markup = '';
		if (typeof raw === 'string') {
			if (raw.includes('<svg')) {
				markup = raw;
			} else {
				markup =
					`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="${sizePx}" height="${sizePx}" fill="${colorHex}">` +
					raw +
					'</svg>';
			}
		}

		if (!markup) {
			return;
		}

		element.innerHTML = markup;
		try {
			localStorage.setItem(keyMarkup, markup);
		} catch {
			// Ignore localStorage write errors in private mode.
		}
	});
}
