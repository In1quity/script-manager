const PROJECT_MAP = {
	wiktionary: 'wikt',
	wikibooks: 'b',
	wikiquote: 'q',
	wikisource: 's',
	wikinews: 'n',
	wikiversity: 'v',
	wikivoyage: 'voyage'
};

export function getProjectPrefix(wiki) {
	if (!wiki || typeof wiki !== 'string') {
		return null;
	}

	const normalized = wiki.toLowerCase().replace(/^www\./, '');
	const langProject = normalized.match(
		/^([a-z-]{2,10})\.(wikipedia|wiktionary|wikibooks|wikiquote|wikisource|wikinews|wikiversity|wikivoyage)$/
	);
	if (langProject) {
		const lang = langProject[1];
		const project = langProject[2];
		if (project === 'wikipedia') {
			return `w:${lang}`;
		}

		return `${PROJECT_MAP[project] || project}:${lang}`;
	}

	const commonsProject = normalized.match(/^(commons|meta|species|wikidata|mediawiki)\.wikimedia$/);
	if (commonsProject) {
		const prefix = commonsProject[1];
		return prefix === 'commons' ? 'c' : prefix;
	}

	return null;
}

export function getCurrentWikiFragment() {
	try {
		const serverName = mw?.config?.get('wgServerName') || '';
		return String(serverName || '').replace(/\.org$/i, '');
	} catch {
		return '';
	}
}

export function urlToInterwiki(url) {
	try {
		const parsed = new URL(url, window.location.href);
		const host = parsed.hostname.replace(/\.org$/i, '');
		const prefix = getProjectPrefix(host);
		const title = parsed.searchParams.get('title');
		if (!prefix || !title) {
			return null;
		}

		return `${prefix}:${decodeURIComponent(title)}`;
	} catch {
		return null;
	}
}
