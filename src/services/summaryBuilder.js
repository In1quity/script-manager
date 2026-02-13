import { SUMMARY_TAG } from '@constants/config';
import { getCurrentWikiFragment, getProjectPrefix, getTargetWikiFragment } from '@utils/interwiki';
import { getServerName } from '@utils/mediawiki';

function withSummaryTag(text) {
	const base = String(text || '');
	return SUMMARY_TAG ? `${base} ${SUMMARY_TAG}` : base;
}

export function buildSummaryLinkTitle(imp) {
	try {
		const page = imp?.page;
		if (!page) {
			return '';
		}

		if (imp?.docInterwiki && typeof imp.docInterwiki === 'string') {
			return imp.docInterwiki;
		}

		if (imp?.type === 1 && imp?.wiki) {
			const currentFragment = getTargetWikiFragment(imp.target);
			const sourceFragment = String(imp.wiki).toLowerCase();
			const sameWiki =
				Boolean(currentFragment) &&
				(currentFragment.indexOf(sourceFragment) === 0 || sourceFragment.indexOf(currentFragment) === 0);

			if (!sameWiki) {
				const prefix = getProjectPrefix(imp.wiki);
				if (prefix) {
					return `${prefix}:${page}`;
				}
			}

			return page;
		}

		if (imp?.target === 'global' && imp?.type !== 1) {
			const currentPrefix = getProjectPrefix(getCurrentWikiFragment());
			if (currentPrefix) {
				return `${currentPrefix}:${page}`;
			}
		}

		return page;
	} catch {
		return imp?.page || '';
	}
}

function applyReplacements(text, description, replacements = {}) {
	let out = String(text || '').replace(/\$1/g, String(description || ''));
	Object.keys(replacements).forEach((key) => {
		out = out.replace(new RegExp(escapeReplacementKey(key), 'g'), String(replacements[key] || ''));
	});
	return out;
}

function escapeReplacementKey(key) {
	return key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getSummaryForTarget(target, summaryKey, description, strings = {}, replacements = {}) {
	const fallbackStrings = strings.fallback || {};
	const currentStrings = strings.current || {};
	const siteStrings = strings.site || {};
	const messageFallback = fallbackStrings[summaryKey] || summaryKey;
	const details = String(description || '');

	try {
		const serverName = getServerName();
		const englishOnlyHost = /(^|\.)mediawiki\.org$/i.test(serverName) || /(^|\.)wikidata\.org$/i.test(serverName);
		if (target === 'global' || englishOnlyHost) {
			return withSummaryTag(applyReplacements(messageFallback, details, replacements));
		}

		if (Object.prototype.hasOwnProperty.call(siteStrings, summaryKey)) {
			return withSummaryTag(applyReplacements(String(siteStrings[summaryKey] || summaryKey), details, replacements));
		}

		if (Object.prototype.hasOwnProperty.call(currentStrings, summaryKey)) {
			return withSummaryTag(applyReplacements(String(currentStrings[summaryKey] || summaryKey), details, replacements));
		}

		return withSummaryTag(applyReplacements(messageFallback, details, replacements));
	} catch {
		return withSummaryTag(applyReplacements(messageFallback, details, replacements));
	}
}
