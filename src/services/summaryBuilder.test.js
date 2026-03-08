import { beforeEach, describe, expect, it } from 'vitest';
import { SUMMARY_TAG } from '@constants/config';
import { buildSummaryLinkTitle, getSummaryForTarget } from '@services/summaryBuilder';

function setServerName(serverName) {
	globalThis.mw = {
		config: {
			get: (key) => (key === 'wgServerName' ? serverName : '')
		}
	};
}

describe('buildSummaryLinkTitle', () => {
	beforeEach(() => {
		setServerName('en.wikipedia.org');
	});

	it('returns page for local imports', () => {
		const imp = { type: 0, page: 'User:Foo/bar.js', target: 'common' };
		expect(buildSummaryLinkTitle(imp)).toBe('User:Foo/bar.js');
	});

	it('returns page for remote imports from the same wiki', () => {
		const imp = { type: 1, wiki: 'en.wikipedia', page: 'User:Foo/bar.js', target: 'common' };
		expect(buildSummaryLinkTitle(imp)).toBe('User:Foo/bar.js');
	});

	it('returns prefixed page for remote imports from another wiki', () => {
		const imp = { type: 1, wiki: 'commons.wikimedia', page: 'User:Foo/bar.js', target: 'common' };
		expect(buildSummaryLinkTitle(imp)).toBe('c:User:Foo/bar.js');
	});

	it('returns documentation interwiki when resolved', () => {
		const imp = {
			type: 1,
			wiki: 'en.wikipedia',
			page: 'User:Foo/bar.js',
			target: 'common',
			docInterwiki: 'mw:Script Manager'
		};
		expect(buildSummaryLinkTitle(imp)).toBe('mw:Script Manager');
	});

	it('returns current wiki prefix for global local imports', () => {
		setServerName('ru.wikipedia.org');
		const imp = { type: 0, page: 'User:Foo/bar.js', target: 'global' };
		expect(buildSummaryLinkTitle(imp)).toBe('w:ru:User:Foo/bar.js');
	});
});

describe('getSummaryForTarget', () => {
	beforeEach(() => {
		setServerName('ru.wikipedia.org');
	});

	it('uses site summary when available', () => {
		const strings = {
			fallback: { 'summary-install': 'Install $1' },
			current: { 'summary-install': 'Current $1' },
			site: { 'summary-install': 'Site $1' }
		};
		const summary = getSummaryForTarget('common', 'summary-install', '[[User:Foo/bar.js]]', strings);
		expect(summary).toBe(`Site [[User:Foo/bar.js]] ${SUMMARY_TAG}`);
	});

	it('falls back to current summary when site is unavailable', () => {
		const strings = {
			fallback: { 'summary-install': 'Install $1' },
			current: { 'summary-install': 'Current $1' },
			site: {}
		};
		const summary = getSummaryForTarget('common', 'summary-install', '[[User:Foo/bar.js]]', strings);
		expect(summary).toBe(`Current [[User:Foo/bar.js]] ${SUMMARY_TAG}`);
	});

	it('falls back to fallback summary when site/current are missing', () => {
		const strings = {
			fallback: { 'summary-install': 'Install $1' },
			current: {},
			site: {}
		};
		const summary = getSummaryForTarget('common', 'summary-install', '[[User:Foo/bar.js]]', strings);
		expect(summary).toBe(`Install [[User:Foo/bar.js]] ${SUMMARY_TAG}`);
	});

	it('uses fallback summary for global target and applies replacements', () => {
		const strings = {
			fallback: { 'summary-move-to-global': 'Move $1 from $2 ($3)' },
			current: { 'summary-move-to-global': 'Current $1 from $2 ($3)' },
			site: { 'summary-move-to-global': 'Site $1 from $2 ($3)' }
		};
		const summary = getSummaryForTarget(
			'global',
			'summary-move-to-global',
			'[[User:Foo/bar.js]]',
			strings,
			{ $2: 'common', $3: 'ru.wikipedia' }
		);
		expect(summary).toBe(`Move [[User:Foo/bar.js]] from common (ru.wikipedia) ${SUMMARY_TAG}`);
	});

	it('uses fallback summary on english-only hosts', () => {
		setServerName('www.mediawiki.org');
		const strings = {
			fallback: { 'summary-install': 'Install $1' },
			current: { 'summary-install': 'Current $1' },
			site: { 'summary-install': 'Site $1' }
		};
		const summary = getSummaryForTarget('common', 'summary-install', '[[User:Foo/bar.js]]', strings);
		expect(summary).toBe(`Install [[User:Foo/bar.js]] ${SUMMARY_TAG}`);
	});
});
