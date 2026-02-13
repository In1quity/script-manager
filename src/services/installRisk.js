import { getCurrentSourceWiki, getServerName, normalizeMediaWikiHost, normalizeSourceWiki } from '@utils/mediawiki';
import { fetchWithTimeout } from '@utils/network';
import { extractWikitextFromResponse } from '@utils/wikitext';

const WIKIMEDIA_HOST_SUFFIXES = [
	'mediawiki.org',
	'wikibooks.org',
	'wikidata.org',
	'wikifunctions.org',
	'wikimedia.org',
	'wikinews.org',
	'wikipedia.org',
	'wikiquote.org',
	'wikisource.org',
	'wikiversity.org',
	'wikivoyage.org',
	'wiktionary.org'
];
const NETWORK_LITERAL_PATTERNS = [
	/(?:^|[^\w$])(?:fetch|fetchWithTimeout)\s*\(\s*(['"`])(?<url>(?:https?:)?\/\/[^'"`]+)\1/gi,
	/(?:^|[^\w$])mw\s*\.\s*loader\s*\.\s*load\s*\(\s*(['"`])(?<url>(?:https?:)?\/\/[^'"`]+)\1/gi,
	/(?:^|[^\w$])(?:\$|jQuery)\s*\.\s*(?:get|post|getJSON)\s*\(\s*(['"`])(?<url>(?:https?:)?\/\/[^'"`]+)\1/gi,
	/(?:^|[^\w$])(?:\$|jQuery)\s*\.\s*ajax\s*\(\s*\{[\s\S]{0,600}?\burl\s*:\s*(['"`])(?<url>(?:https?:)?\/\/[^'"`]+)\1[\s\S]{0,600}?\}\s*\)/gi,
	/(?:^|[^\w$])navigator\s*\.\s*sendBeacon\s*\(\s*(['"`])(?<url>(?:https?:)?\/\/[^'"`]+)\1/gi,
	/(?:^|[^\w$])new\s+WebSocket\s*\(\s*(['"`])(?<url>(?:wss?:)?\/\/[^'"`]+)\1/gi,
	/(?:^|[^\w$])(?:new\s+)?mw\s*\.\s*ForeignApi\s*\(\s*(['"`])(?<url>(?:https?:)?\/\/[^'"`]+)\1/gi,
	/(?:^|[^\w$])importScripts\s*\(\s*(['"`])(?<url>(?:https?:)?\/\/[^'"`]+)\1/gi,
	/\.open\s*\(\s*(['"`])(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\1\s*,\s*(['"`])(?<url>(?:https?:)?\/\/[^'"`]+)\2/gi
];
const NETWORK_VARIABLE_PATTERNS = [
	/(?:^|[^\w$])(?:fetch|fetchWithTimeout)\s*\(\s*([A-Za-z_$][\w$]*)\b/g,
	/(?:^|[^\w$])(?:fetch|fetchWithTimeout)\s*\(\s*`[^`]*\$\{([A-Za-z_$][\w$]*)\}[^`]*`/g,
	/(?:^|[^\w$])mw\s*\.\s*loader\s*\.\s*load\s*\(\s*([A-Za-z_$][\w$]*)\b/g,
	/(?:^|[^\w$])(?:\$|jQuery)\s*\.\s*(?:get|post|getJSON)\s*\(\s*([A-Za-z_$][\w$]*)\b/g,
	/(?:^|[^\w$])navigator\s*\.\s*sendBeacon\s*\(\s*([A-Za-z_$][\w$]*)\b/g,
	/(?:^|[^\w$])new\s+WebSocket\s*\(\s*([A-Za-z_$][\w$]*)\b/g,
	/(?:^|[^\w$])(?:new\s+)?mw\s*\.\s*ForeignApi\s*\(\s*([A-Za-z_$][\w$]*)\b/g,
	/(?:^|[^\w$])importScripts\s*\(\s*([A-Za-z_$][\w$]*)\b/g
];
const URL_CANDIDATE_RGX = /(?<url>(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s'"`)<>]*)/gi;
const DEFAULT_DEEP_SCAN_DEPTH = 2;
const DEFAULT_DEEP_SCAN_MAX_SCRIPTS = 30;

function resolveSourceWiki(sourceWikiValue) {
	const fromParam = normalizeSourceWiki(sourceWikiValue);
	if (fromParam) {
		return fromParam;
	}
	return getCurrentSourceWiki();
}

function resolveSourceHost(sourceWikiValue) {
	const sourceWiki = resolveSourceWiki(sourceWikiValue);
	const sourceHost = sourceWiki ? `${sourceWiki}.org` : getServerName();
	return normalizeMediaWikiHost(sourceHost).toLowerCase();
}

function stripJsComments(scriptSourceText) {
	const source = String(scriptSourceText || '');
	let output = '';
	let inLineComment = false;
	let inBlockComment = false;
	let inSingleQuote = false;
	let inDoubleQuote = false;
	let inTemplate = false;
	let escaped = false;

	for (let index = 0; index < source.length; index++) {
		const char = source[index];
		const next = source[index + 1];

		if (inLineComment) {
			if (char === '\n') {
				inLineComment = false;
				output += '\n';
			} else {
				output += ' ';
			}
			continue;
		}

		if (inBlockComment) {
			if (char === '*' && next === '/') {
				inBlockComment = false;
				output += '  ';
				index++;
			} else {
				output += char === '\n' ? '\n' : ' ';
			}
			continue;
		}

		if (inSingleQuote || inDoubleQuote || inTemplate) {
			output += char;
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (inSingleQuote && char === '\'') {
				inSingleQuote = false;
			} else if (inDoubleQuote && char === '"') {
				inDoubleQuote = false;
			} else if (inTemplate && char === '`') {
				inTemplate = false;
			}
			continue;
		}

		if (char === '/' && next === '/') {
			inLineComment = true;
			output += '  ';
			index++;
			continue;
		}
		if (char === '/' && next === '*') {
			inBlockComment = true;
			output += '  ';
			index++;
			continue;
		}
		if (char === '\'') {
			inSingleQuote = true;
			output += char;
			continue;
		}
		if (char === '"') {
			inDoubleQuote = true;
			output += char;
			continue;
		}
		if (char === '`') {
			inTemplate = true;
			output += char;
			continue;
		}

		output += char;
	}

	return output;
}

function toParsedUrl(rawUrl) {
	const candidate = String(rawUrl || '').trim();
	if (!candidate) {
		return null;
	}
	const withProtocol = candidate.startsWith('//') ? `https:${candidate}` : candidate;
	try {
		return new URL(withProtocol);
	} catch {
		return null;
	}
}

function toNormalizedHost(rawUrl) {
	const parsed = toParsedUrl(rawUrl);
	if (!parsed) {
		return '';
	}
	return normalizeMediaWikiHost(parsed.hostname || '').toLowerCase();
}

function isNonNetworkNamespaceUrl(rawUrl) {
	const parsed = toParsedUrl(rawUrl);
	if (!parsed) {
		return false;
	}
	const host = String(parsed.hostname || '').toLowerCase();
	const path = String(parsed.pathname || '');
	if (!host.endsWith('w3.org')) {
		return false;
	}
	return /^\/(?:1999|2000)\//.test(path);
}

function extractExternalUrlsFromScriptSource(scriptSourceText) {
	const source = stripJsComments(scriptSourceText);
	const urls = new Set();

	NETWORK_LITERAL_PATTERNS.forEach((pattern) => {
		pattern.lastIndex = 0;
		let match;
		while ((match = pattern.exec(source)) !== null) {
			const url = match?.groups?.url || '';
			if (url) {
				urls.add(url);
			}
		}
	});

	const variableUrls = Object.create(null);
	source.split('\n').forEach((line) => {
		const assignmentMatch =
			/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*.*?(['"`])((?:https?:)?\/\/[^'"`]+)\2/.exec(line);
		if (!assignmentMatch) {
			return;
		}
		const varName = assignmentMatch[1];
		const varUrl = assignmentMatch[3];
		if (!variableUrls[varName]) {
			variableUrls[varName] = new Set();
		}
		variableUrls[varName].add(varUrl);
	});

	NETWORK_VARIABLE_PATTERNS.forEach((pattern) => {
		pattern.lastIndex = 0;
		let match;
		while ((match = pattern.exec(source)) !== null) {
			const varName = match?.[1] || '';
			if (!varName || !variableUrls[varName]) {
				continue;
			}
			variableUrls[varName].forEach((url) => urls.add(url));
		}
	});

	URL_CANDIDATE_RGX.lastIndex = 0;
	let urlMatch;
	while ((urlMatch = URL_CANDIDATE_RGX.exec(source)) !== null) {
		const url = urlMatch?.groups?.url || '';
		if (!url || isNonNetworkNamespaceUrl(url)) {
			continue;
		}
		urls.add(url);
	}
	return Array.from(urls);
}

function extractExternalHostsFromScriptSource(scriptSourceText) {
	const urls = extractExternalUrlsFromScriptSource(scriptSourceText);
	const hosts = new Set();
	urls.forEach((url) => {
		const host = toNormalizedHost(url);
		if (host) {
			hosts.add(host);
		}
	});
	return Array.from(hosts);
}

function normalizeWikiScriptTitle(rawTitle) {
	const candidate = String(rawTitle || '').trim();
	if (!candidate) {
		return '';
	}
	let decodedTitle = candidate;
	try {
		decodedTitle = decodeURIComponent(candidate);
	} catch {
		decodedTitle = candidate;
	}
	return decodedTitle.replace(/_/g, ' ').replace(/#.*$/, '').trim();
}

function resolveWikimediaScriptReference(rawUrl) {
	const parsed = toParsedUrl(rawUrl);
	if (!parsed) {
		return null;
	}
	const host = normalizeMediaWikiHost(parsed.hostname || '').toLowerCase();
	if (!host || !isWikimediaHost(host)) {
		return null;
	}
	const queryTitle = parsed.searchParams.get('title');
	let title = queryTitle || '';
	if (!title && parsed.pathname.startsWith('/wiki/')) {
		title = parsed.pathname.slice('/wiki/'.length);
	}
	title = normalizeWikiScriptTitle(title);
	if (!title || !/\.js$/i.test(title)) {
		return null;
	}
	return { host, title };
}

function toScriptKey(host, title) {
	return `${host}|${String(title || '').toLowerCase()}`;
}

function isWikimediaHost(host) {
	const normalized = String(host || '').trim().toLowerCase();
	if (!normalized) {
		return false;
	}
	return WIKIMEDIA_HOST_SUFFIXES.some((suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`));
}

async function fetchScriptSourceText(scriptName, sourceWikiValue) {
	const sourceHost = resolveSourceHost(sourceWikiValue);
	return fetchScriptSourceTextFromHost(scriptName, sourceHost);
}

async function fetchScriptSourceTextFromHost(scriptName, sourceHostValue) {
	const sourceHost = normalizeMediaWikiHost(sourceHostValue || '').toLowerCase();
	const title = encodeURIComponent(String(scriptName || '').replace(/_/g, ' '));
	const url =
		`https://${sourceHost}/w/api.php?action=query&format=json&formatversion=2&origin=*` +
		`&prop=revisions&rvprop=content&rvslots=main&titles=${title}`;
	const response = await fetchWithTimeout(url);
	if (!response.ok) {
		throw new Error(`Failed to load script source from ${sourceHost}`);
	}
	const payload = await response.json();
	return extractWikitextFromResponse(payload) || '';
}

export async function detectExternalLoadHosts(scriptName, sourceWikiValue) {
	const currentHost = normalizeMediaWikiHost(getServerName()).toLowerCase();
	const scriptSourceText = await fetchScriptSourceText(scriptName, sourceWikiValue);
	const hosts = extractExternalHostsFromScriptSource(scriptSourceText);
	const externalHosts = hosts.filter((host) => host && host !== currentHost);
	const wikimediaHosts = externalHosts.filter((host) => isWikimediaHost(host));
	const nonWikimediaHosts = externalHosts.filter((host) => !isWikimediaHost(host));
	return {
		wikimediaHosts: Array.from(new Set(wikimediaHosts)).sort(),
		nonWikimediaHosts: Array.from(new Set(nonWikimediaHosts)).sort()
	};
}

export async function detectExternalLoadHostsDeep(scriptName, sourceWikiValue, options = {}) {
	const currentHost = normalizeMediaWikiHost(getServerName()).toLowerCase();
	const sourceHost = resolveSourceHost(sourceWikiValue);
	const startTitle = normalizeWikiScriptTitle(scriptName);
	const maxDepthValue = Number(options?.maxDepth);
	const maxDepth = Number.isFinite(maxDepthValue)
		? Math.max(0, Math.floor(maxDepthValue))
		: DEFAULT_DEEP_SCAN_DEPTH;
	const maxScriptsValue = Number(options?.maxScripts);
	const maxScripts = Number.isFinite(maxScriptsValue)
		? Math.max(1, Math.floor(maxScriptsValue))
		: DEFAULT_DEEP_SCAN_MAX_SCRIPTS;

	const queue = [ { host: sourceHost, title: startTitle, depth: 0 } ];
	const visitedScriptKeys = new Set([ toScriptKey(sourceHost, startTitle) ]);
	const externalHosts = new Set();
	let scannedScripts = 0;

	while (queue.length && scannedScripts < maxScripts) {
		const currentScript = queue.shift();
		if (!currentScript || !currentScript.title) {
			continue;
		}
		let scriptSourceText = '';
		try {
			scriptSourceText = await fetchScriptSourceTextFromHost(currentScript.title, currentScript.host);
		} catch {
			continue;
		}
		scannedScripts++;
		const urls = extractExternalUrlsFromScriptSource(scriptSourceText);
		urls.forEach((rawUrl) => {
			const host = toNormalizedHost(rawUrl);
			if (host && host !== currentHost) {
				externalHosts.add(host);
			}
			if (currentScript.depth >= maxDepth) {
				return;
			}
			const nextScript = resolveWikimediaScriptReference(rawUrl);
			if (!nextScript) {
				return;
			}
			const nextKey = toScriptKey(nextScript.host, nextScript.title);
			if (visitedScriptKeys.has(nextKey)) {
				return;
			}
			visitedScriptKeys.add(nextKey);
			queue.push({
				host: nextScript.host,
				title: nextScript.title,
				depth: currentScript.depth + 1
			});
		});
	}

	const hosts = Array.from(externalHosts);
	const wikimediaHosts = hosts.filter((host) => isWikimediaHost(host));
	const nonWikimediaHosts = hosts.filter((host) => !isWikimediaHost(host));
	return {
		wikimediaHosts: Array.from(new Set(wikimediaHosts)).sort(),
		nonWikimediaHosts: Array.from(new Set(nonWikimediaHosts)).sort(),
		scannedScripts,
		truncated: queue.length > 0
	};
}
