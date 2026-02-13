import { decodeSafe } from '@utils/url';

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

	const commonsProject = normalized.match(/^(commons|meta|species)\.wikimedia$/);
	if (commonsProject) {
		const prefix = commonsProject[1];
		return prefix === 'commons' ? 'c' : prefix;
	}

	if (normalized === 'wikidata') {
		return 'd';
	}

	if (normalized === 'mediawiki') {
		return 'mw';
	}

	return null;
}

export function getCurrentWikiFragment() {
	try {
		const serverName = mw?.config?.get('wgServerName') || '';
		return String(serverName || '')
			.toLowerCase()
			.replace(/\.org$/i, '')
			.replace(/^www\./, '');
	} catch {
		return '';
	}
}

export function getTargetWikiFragment(target) {
	return target === 'global' ? 'meta.wikimedia' : getCurrentWikiFragment();
}

export function urlToInterwiki(url) {
	try {
		const parsed = new URL(url, window.location.href);
		const host = parsed.hostname.replace(/\.org$/i, '');
		const prefix = getProjectPrefix(host);
		const title = parsed.searchParams.get('title') || parsed.pathname.replace(/^\/wiki\//, '');
		if (!prefix || !title) {
			return null;
		}

		return `${prefix}:${decodeSafe(title).replace(/_/g, ' ')}`;
	} catch {
		return null;
	}
}
