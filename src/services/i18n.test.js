import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchWithTimeoutMock = vi.fn();

vi.mock('@utils/network', () => ({
	fetchWithTimeout: fetchWithTimeoutMock
}));

describe('i18n service', () => {
	beforeEach(() => {
		fetchWithTimeoutMock.mockReset();
		globalThis.window = {
			ScriptManagerI18nBaseUrl: 'https://example.test/i18n'
		};
		globalThis.mw = {
			config: {
				get: vi.fn(() => 'en')
			}
		};
	});

	it('prefers requested zh-hant language over zh-hans fallback', async () => {
		fetchWithTimeoutMock.mockImplementation(async (url) => {
			if (url.includes('/zh-hant.json')) {
				return { ok: true, json: async () => ({ greeting: 'traditional' }) };
			}
			if (url.includes('/zh-hans.json')) {
				return { ok: true, json: async () => ({ greeting: 'simplified' }) };
			}
			if (url.includes('/en.json')) {
				return { ok: true, json: async () => ({ greeting: 'english' }) };
			}
			return { ok: false, json: async () => ({}) };
		});

		const { loadI18n, t } = await import('@services/i18n');
		await loadI18n('zh-hant', { siteLanguage: 'en' });

		expect(t('greeting')).toBe('traditional');
	});

	it('rejects invalid language code used for fetch', async () => {
		const { loadI18n } = await import('@services/i18n');
		await expect(loadI18n('../bad', { siteLanguage: 'en' })).resolves.toBeTruthy();
		expect(fetchWithTimeoutMock).not.toHaveBeenCalledWith(
			expect.stringContaining('../bad')
		);
	});
});
