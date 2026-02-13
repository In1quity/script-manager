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

export function getSummaryForTarget(target, summaryKey, description, strings = {}) {
	const fallbackStrings = strings.fallback || {};
	const currentStrings = strings.current || {};
	const siteStrings = strings.site || {};
	const messageFallback = fallbackStrings[summaryKey] || summaryKey;
	const details = String(description || '');

	try {
		const serverName = getServerName();
		const englishOnlyHost = /(^|\.)mediawiki\.org$/i.test(serverName) || /(^|\.)wikidata\.org$/i.test(serverName);
		if (target === 'global' || englishOnlyHost) {
			return withSummaryTag(messageFallback.replace('$1', details));
		}

		if (Object.prototype.hasOwnProperty.call(siteStrings, summaryKey)) {
			return withSummaryTag(String(siteStrings[summaryKey] || summaryKey).replace('$1', details));
		}

		if (Object.prototype.hasOwnProperty.call(currentStrings, summaryKey)) {
			return withSummaryTag(String(currentStrings[summaryKey] || summaryKey).replace('$1', details));
		}

		return withSummaryTag(messageFallback.replace('$1', details));
	} catch {
		return withSummaryTag(messageFallback.replace('$1', details));
	}
}
