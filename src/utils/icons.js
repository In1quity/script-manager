const ICON_CACHE_VERSION = 'v2';

function sanitizeSvgMarkup(markup) {
	const rawMarkup = String(markup || '').trim();
	if (!rawMarkup) {
		return '';
	}
	try {
		const parser = new DOMParser();
		const doc = parser.parseFromString(rawMarkup, 'image/svg+xml');
		if (doc.querySelector('parsererror')) {
			return '';
		}
		doc.querySelectorAll('script,foreignObject').forEach((node) => node.remove());
		doc.querySelectorAll('*').forEach((node) => {
			Array.from(node.attributes || []).forEach((attr) => {
				const name = String(attr.name || '').toLowerCase();
				const value = String(attr.value || '').trim().toLowerCase();
				if (name.startsWith('on')) {
					node.removeAttribute(attr.name);
					return;
				}
				if ((name === 'href' || name === 'xlink:href') && value.startsWith('javascript:')) {
					node.removeAttribute(attr.name);
				}
			});
		});
		const svg = doc.documentElement;
		return svg?.tagName?.toLowerCase() === 'svg' ? svg.outerHTML : '';
	} catch {
		return '';
	}
}

export function loadCodexIconViaApi(iconName) {
	const keyRaw = `SM_ICON_RAW_${ICON_CACHE_VERSION}_${iconName}`;
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
				raw =
					item &&
					(
						item.icon ||
						item.svg ||
						item.value ||
						item.default ||
						(typeof item.langCodeMap === 'object' && item.langCodeMap && Object.values(item.langCodeMap).find((v) => typeof v === 'string')) ||
						null
					);
			} else if (codexIcons && typeof codexIcons === 'object') {
				const item = codexIcons[iconName] || null;
				if (typeof item === 'string') {
					raw = item;
				} else if (item && typeof item === 'object') {
					raw =
						item.icon ||
						item.svg ||
						item.value ||
						item.default ||
						(typeof item.langCodeMap === 'object' && item.langCodeMap && Object.values(item.langCodeMap).find((v) => typeof v === 'string')) ||
						null;
				}
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

	const keyMarkup = `SM_ICON_MARKUP_${ICON_CACHE_VERSION}_${iconName}_${colorHex || ''}_${sizePx || ''}`;
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
		const safeMarkup = sanitizeSvgMarkup(markup);
		if (!safeMarkup) {
			return;
		}

		element.innerHTML = safeMarkup;
		try {
			localStorage.setItem(keyMarkup, safeMarkup);
		} catch {
			// Ignore localStorage write errors in private mode.
		}
	});
}
