import { beforeEach, describe, expect, it, vi } from 'vitest';
import { urlToInterwiki } from '@utils/interwiki';

vi.mock('@services/api', () => ({
	getApiForTarget: vi.fn()
}));
vi.mock('@services/i18n', () => ({
	getStrings: () => ({
		fallback: {
			'label-backlink': 'Backlink:'
		}
	}),
	t: (key) => key
}));
vi.mock('@services/notification', () => ({
	showNotification: vi.fn()
}));
vi.mock('@services/summaryBuilder', () => ({
	buildSummaryLinkTitle: (imp) => imp?.docInterwiki || imp?.page || '',
	getSummaryForTarget: () => 'summary'
}));
vi.mock('@utils/network', () => ({
	fetchWithTimeout: vi.fn()
}));
vi.mock('@utils/wikitext', () => ({
	getWikitext: vi.fn()
}));
vi.mock('@utils/logger', () => ({
	createLogger: () => ({
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		child() {
			return this;
		}
	})
}));

import { fetchWithTimeout } from '@utils/network';
import { Import } from '@services/imports';

function createMwMock(serverName = 'ru.wikipedia.org') {
	const foreignApiGet = vi.fn().mockResolvedValue({
		query: {
			pages: [
				{
					revisions: [
						{
							slots: {
								main: {
									content: ''
								}
							}
						}
					]
				}
			]
		}
	});
	return {
		config: {
			get: (key) => {
				if (key === 'wgServerName') return serverName;
				if (key === 'wgUserName') return 'Iniquity';
				return '';
			}
		},
		ForeignApi: vi.fn(function() {
			return {
				get: foreignApiGet
			};
		}),
		__foreignApiGet: foreignApiGet
	};
}

describe('Import core mechanics', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		globalThis.mw = createMwMock('ru.wikipedia.org');
	});

	describe('Import.fromJs', () => {
		it('parses importScript as local import', () => {
			const parsed = Import.fromJs('importScript(\'User:Foo/bar.js\');', 'common');
			expect(parsed).not.toBeNull();
			expect(parsed.type).toBe(0);
			expect(parsed.page).toBe('User:Foo/bar.js');
		});

		it('parses mw.loader.load wiki index.php URL as remote wiki import', () => {
			const parsed = Import.fromJs(
				'mw.loader.load(\'//en.wikipedia.org/w/index.php?action=raw&title=User:Foo%2Fbar.js&ctype=text/javascript\');',
				'common'
			);
			expect(parsed).not.toBeNull();
			expect(parsed.type).toBe(1);
			expect(parsed.wiki).toBe('en.wikipedia');
			expect(parsed.page).toBe('User:Foo/bar.js');
		});

		it('parses non-wikimedia URL as raw URL import', () => {
			const parsed = Import.fromJs('mw.loader.load(\'//example.com/foo.js\');', 'common');
			expect(parsed).not.toBeNull();
			expect(parsed.type).toBe(2);
			expect(parsed.url).toBe('//example.com/foo.js');
		});

		it('marks disabled imports when line is commented', () => {
			const parsed = Import.fromJs('//mw.loader.load(\'//example.com/foo.js\');', 'common');
			expect(parsed).not.toBeNull();
			expect(parsed.disabled).toBe(true);
		});

		it('parses loader line even with trailing backlink comment', () => {
			const parsed = Import.fromJs(
				'mw.loader.load(\'//www.mediawiki.org/w/index.php?title=User:Iniquity/scriptManager-test.js&action=raw&ctype=text/javascript\'); // Backlink: [[mw:User:Iniquity/scriptManager-test.js]]',
				'common'
			);
			expect(parsed).not.toBeNull();
			expect(parsed.type).toBe(1);
			expect(parsed.wiki).toBe('www.mediawiki');
			expect(parsed.page).toBe('User:Iniquity/scriptManager-test.js');
		});

		it('returns null for non-import lines', () => {
			expect(Import.fromJs('const x = 1;', 'common')).toBeNull();
		});
	});

	describe('Import.ofUrl', () => {
		it('extracts title without trailing ampersands from wiki index URL', () => {
			const imp = Import.ofUrl(
				'//commons.wikimedia.org/w/index.php?title=User:Foo%2Fbar.js&action=raw&ctype=text/javascript',
				'common'
			);
			expect(imp.type).toBe(1);
			expect(imp.wiki).toBe('commons.wikimedia');
			expect(imp.page).toBe('User:Foo/bar.js');
		});

		it('keeps URL import when title parameter is missing', () => {
			const imp = Import.ofUrl('//commons.wikimedia.org/w/index.php?action=raw', 'common');
			expect(imp.type).toBe(2);
			expect(imp.url).toBe('//commons.wikimedia.org/w/index.php?action=raw');
		});
	});

	describe('toLoaderUrl/getKey/getDisplayName', () => {
		it('builds local JS loader URL', () => {
			const imp = Import.ofLocal('User:Iniquity/script.js', 'common');
			expect(imp.toLoaderUrl('ru.wikipedia.org')).toBe(
				'//ru.wikipedia.org/w/index.php?title=User:Iniquity/script.js&action=raw&ctype=text/javascript'
			);
		});

		it('builds local CSS loader URL with css content-type', () => {
			const imp = Import.ofLocal('User:Iniquity/common.css', 'common');
			expect(imp.toLoaderUrl('ru.wikipedia.org')).toBe(
				'//ru.wikipedia.org/w/index.php?title=User:Iniquity/common.css&action=raw&ctype=text/css'
			);
		});

		it('normalizes mediawiki.org host to www.mediawiki.org', () => {
			const imp = new Import({ page: 'MediaWiki:Gadget-Foo.js', wiki: 'mediawiki', target: 'common' });
			expect(imp.toLoaderUrl('ru.wikipedia.org')).toContain('//www.mediawiki.org/w/index.php?title=');
		});

		it('returns deterministic key and display name', () => {
			const local = Import.ofLocal('User:Foo/bar.js', 'common');
			const remote = new Import({ page: 'User:Foo/bar.js', wiki: 'en.wikipedia', target: 'common' });
			const raw = Import.ofUrl('//example.com/foo.js', 'common');

			expect(local.getKey()).toBe('local:common:User:Foo/bar.js');
			expect(local.getDisplayName()).toBe('User:Foo/bar.js');

			expect(remote.getKey()).toBe('remote:common:en.wikipedia:User:Foo/bar.js');
			expect(remote.getDisplayName()).toBe('User:Foo/bar.js');

			expect(raw.getKey()).toBe('url:common://example.com/foo.js');
			expect(raw.getDisplayName()).toBe('//example.com/foo.js');
		});
	});

	describe('getLineNums', () => {
		it('finds local import by title and encoded title URL form', () => {
			const imp = Import.ofLocal('User:Foo/bar.js', 'common');
			const text = [
				'importScript(\'User:Foo/bar.js\');',
				'mw.loader.load(\'//ru.wikipedia.org/w/index.php?title=User%3AFoo%2Fbar.js&action=raw&ctype=text/javascript\');',
				'console.log(1);'
			].join('\n');
			expect(imp.getLineNums(text)).toEqual([ 0, 1 ]);
		});

		it('returns full capture item range when match is inside capture item', () => {
			const imp = Import.ofLocal('User:Foo/bar.js', 'common');
			const text = [
				'// SM-CAPTURE-START',
				'// SM-CAPTURE-ITEM-START',
				'mw.loader.load(\'//ru.wikipedia.org/w/index.php?title=User%3AFoo%2Fbar.js&action=raw&ctype=text/javascript\');',
				'// SM-CAPTURE-ITEM-END',
				'// SM-CAPTURE-END'
			].join('\n');
			expect(imp.getLineNums(text)).toEqual([ 1, 2, 3 ]);
		});
	});
});

describe('Import documentation resolution', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		globalThis.mw = createMwMock('ru.wikipedia.org');
	});

	it('returns null for raw URL imports (type=2)', async () => {
		const imp = Import.ofUrl('//example.com/raw.js', 'common');
		const result = await imp.resolveDocumentationInterwiki();
		expect(result).toBeNull();
		expect(fetchWithTimeout).not.toHaveBeenCalled();
	});

	it('returns null when page is missing', async () => {
		const imp = new Import({ wiki: 'en.wikipedia', target: 'common' });
		const result = await imp.resolveDocumentationInterwiki();
		expect(result).toBeNull();
		expect(fetchWithTimeout).not.toHaveBeenCalled();
		expect(mw.ForeignApi).not.toHaveBeenCalled();
	});

	it('resolves @documentation reference from fetched script header', async () => {
		mw.__foreignApiGet.mockResolvedValue({
			query: {
				pages: [
					{
						revisions: [
							{
								slots: {
									main: {
										content: '/**\n * @documentation https://www.mediawiki.org/wiki/Script_Manager\n */'
									}
								}
							}
						]
					}
				]
			}
		});
		const imp = Import.ofLocal('User:Iniquity/scriptManager-core-test.js', 'common');
		const result = await imp.resolveDocumentationInterwiki();
		expect(result).toBe('https://www.mediawiki.org/wiki/Script_Manager');
		expect(mw.ForeignApi).toHaveBeenCalledWith('https://ru.wikipedia.org/w/api.php', { anonymous: true });
	});

	it('uses pattern priority: @documentation over Documentation and @see', async () => {
		mw.__foreignApiGet.mockResolvedValue({
			query: {
				pages: [
					{
						revisions: [
							{
								slots: {
									main: {
										content: [
											'/**',
											' * @see https://www.mediawiki.org/wiki/Fallback_Page',
											' * Documentation: https://www.mediawiki.org/wiki/Doc_Page',
											' * @documentation https://www.mediawiki.org/wiki/Script_Manager',
											' */'
										].join('\n')
									}
								}
							}
						]
					}
				]
			}
		});
		const imp = Import.ofLocal('User:Iniquity/script.js', 'common');
		await expect(imp.resolveDocumentationInterwiki()).resolves.toBe('https://www.mediawiki.org/wiki/Script_Manager');
	});

	it('returns null when fetched source has no documentation reference', async () => {
		vi.mocked(fetchWithTimeout).mockResolvedValue({
			ok: true,
			text: async () => 'console.log("no docs");'
		});
		const imp = Import.ofLocal('User:Iniquity/script.js', 'common');
		await expect(imp.resolveDocumentationInterwiki()).resolves.toBeNull();
	});

	it('returns null on fetch error', async () => {
		vi.mocked(fetchWithTimeout).mockRejectedValue(new Error('network failed'));
		const imp = Import.ofLocal('User:Iniquity/script.js', 'common');
		await expect(imp.resolveDocumentationInterwiki()).resolves.toBeNull();
	});

	it('uses ForeignApi for remote wiki without raw fetch', async () => {
		mw.__foreignApiGet.mockResolvedValue({
			query: {
				pages: [
					{
						revisions: [
							{
								slots: {
									main: {
										content: '/** @documentation https://www.mediawiki.org/wiki/Script_Manager */'
									}
								}
							}
						]
					}
				]
			}
		});
		const imp = new Import({ page: 'User:Iniquity/scriptManager-test.js', wiki: 'www.mediawiki', target: 'common' });
		await expect(imp.resolveDocumentationInterwiki()).resolves.toBe('https://www.mediawiki.org/wiki/Script_Manager');
		expect(mw.ForeignApi).toHaveBeenCalledWith('https://www.mediawiki.org/w/api.php', { anonymous: true });
		expect(fetchWithTimeout).not.toHaveBeenCalled();
	});

	it('falls back to api.php fetch when raw fails and ForeignApi unavailable', async () => {
		delete mw.ForeignApi;
		vi.mocked(fetchWithTimeout).mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				query: {
					pages: [
						{
							revisions: [
								{
									slots: {
										main: {
											content: '/** @documentation https://www.mediawiki.org/wiki/Script_Manager */'
										}
									}
								}
							]
						}
					]
				}
			})
		});
		const imp = Import.ofLocal('User:Iniquity/scriptManager-test.js', 'common');
		await expect(imp.resolveDocumentationInterwiki()).resolves.toBe('https://www.mediawiki.org/wiki/Script_Manager');
		expect(fetchWithTimeout).toHaveBeenNthCalledWith(
			1,
			'https://ru.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&titles=User%3AIniquity%2FscriptManager-test.js&format=json&formatversion=2&origin=*'
		);
	});

	it('pipeline converts documentation URL to expected interwiki', async () => {
		mw.__foreignApiGet.mockResolvedValue({
			query: {
				pages: [
					{
						revisions: [
							{
								slots: {
									main: {
										content: '/** @documentation https://www.mediawiki.org/wiki/Script_Manager */'
									}
								}
							}
						]
					}
				]
			}
		});
		const imp = Import.ofLocal('User:Iniquity/script.js', 'common');
		const docUrl = await imp.resolveDocumentationInterwiki();
		expect(urlToInterwiki(docUrl)).toBe('mw:Script Manager');
	});
});
