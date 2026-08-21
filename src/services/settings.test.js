import { beforeEach, describe, expect, it, vi } from 'vitest';

const getApiMock = vi.fn();
const getMetaApiMock = vi.fn();
const getWikitextMock = vi.fn();
const getWikitextWithMetaMock = vi.fn();
const fetchWithTimeoutMock = vi.fn();

vi.mock('@services/api', () => ({
	getApi: getApiMock,
	getMetaApi: getMetaApiMock
}));

vi.mock('@utils/wikitext', () => ({
	getWikitext: getWikitextMock,
	getWikitextWithMeta: getWikitextWithMetaMock
}));

vi.mock('@utils/network', () => ({
	fetchWithTimeout: fetchWithTimeoutMock
}));

describe('settings service', () => {
	beforeEach(() => {
		vi.resetModules();
		getApiMock.mockReset();
		getMetaApiMock.mockReset();
		getWikitextMock.mockReset();
		getWikitextWithMetaMock.mockReset();
		fetchWithTimeoutMock.mockReset();
		getApiMock.mockReturnValue(null);
		getMetaApiMock.mockReturnValue(null);
		globalThis.mw = {
			config: {
				get: vi.fn((key) => {
					if (key === 'wgUserName') {
						return 'Iniquity';
					}
					return '';
				})
			},
			user: {
				options: {
					get: vi.fn((key) => {
						if (key === 'userjs-sm-settings') {
							return JSON.stringify({
								defaultTab: 'all',
								captureEnabled: true
							});
						}
						return '';
					}),
					set: vi.fn()
				}
			}
		};
	});

	it('loads settings from legacy option when APIs are unavailable', async () => {
		const { loadSettings } = await import('@services/settings');
		const settings = await loadSettings(true);

		expect(settings.defaultTab).toBe('all');
		expect(settings.captureEnabled).toBe(true);
	});

	it('saves settings in memory when APIs are unavailable', async () => {
		const { saveSettings, getSetting } = await import('@services/settings');
		const saved = await saveSettings({
			defaultTab: 'gadgets',
			captureEnabled: true,
			userscriptLoadCachingEnabled: false
		});

		expect(saved.defaultTab).toBe('gadgets');
		expect(getSetting('captureEnabled')).toBe(true);
	});
});
