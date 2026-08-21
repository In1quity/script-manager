import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchWithTimeoutMock = vi.fn();

vi.mock('@utils/network', () => ({
	fetchWithTimeout: fetchWithTimeoutMock
}));

vi.mock('@utils/mediawiki', () => ({
	getCurrentSourceWiki: () => 'ru.wikipedia',
	getServerName: () => 'ru.wikipedia.org',
	normalizeMediaWikiHost: (host) => String(host || '').replace(/^https?:\/\//i, ''),
	normalizeSourceWiki: (value) => String(value || '').replace(/\.org$/i, '')
}));

describe('install risk detection', () => {
	beforeEach(() => {
		fetchWithTimeoutMock.mockReset();
	});

	it('detects wikimedia and non-wikimedia hosts from script source', async () => {
		const scriptSource = [
			"mw.loader.load('//ru.wikipedia.org/w/index.php?title=User:A/test.js&action=raw&ctype=text/javascript');",
			"fetch('https://commons.wikimedia.org/w/index.php?title=User:B/tool.js&action=raw&ctype=text/javascript');",
			"fetch('https://example.com/pixel.gif');",
			"// fetch('https://ignored.example.com')"
		].join('\n');

		fetchWithTimeoutMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				query: {
					pages: [
						{
							revisions: [
								{
									slots: {
										main: {
											content: scriptSource
										}
									}
								}
							]
						}
					]
				}
			})
		});

		const { detectExternalLoadHosts } = await import('@services/installRisk');
		const result = await detectExternalLoadHosts('User:Iniquity/script.js', 'ru.wikipedia');

		expect(result.currentWikiHosts).toEqual([ 'ru.wikipedia.org' ]);
		expect(result.wikimediaHosts).toEqual([ 'commons.wikimedia.org' ]);
		expect(result.nonWikimediaHosts).toEqual([ 'example.com' ]);
		expect(result.hasWikimediaScriptReferences).toBe(true);
	});
});
