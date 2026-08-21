export function getBuildInfo() {
	return {
		version: typeof SM_VERSION !== 'undefined' && SM_VERSION ? String(SM_VERSION) : 'dev',
		buildDate: typeof BUILD_DATE !== 'undefined' && BUILD_DATE ? String(BUILD_DATE) : ''
	};
}

export function formatBuildDate(isoDate, language) {
	const source = String(isoDate || '').trim();
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(source);
	if (!match) {
		return source;
	}

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(Date.UTC(year, month - 1, day));
	if (Number.isNaN(date.getTime())) {
		return source;
	}

	try {
		const locale = language
			|| (typeof mw !== 'undefined' && mw?.config?.get?.('wgUserLanguage'))
			|| 'en';
		return date.toLocaleDateString(locale, {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			timeZone: 'UTC'
		});
	} catch {
		return source;
	}
}
