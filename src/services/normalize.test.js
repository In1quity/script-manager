import { beforeEach, describe, expect, it, vi } from 'vitest';

const getApiForTargetMock = vi.fn();
const getWikitextWithMetaMock = vi.fn();
const showNotificationMock = vi.fn();

vi.mock('@services/api', () => ({
	getApiForTarget: getApiForTargetMock
}));

vi.mock('@services/i18n', () => ({
	getStrings: () => ({ fallback: { 'label-backlink': 'Backlink:' } }),
	t: (key) => key
}));

vi.mock('@services/notification', () => ({
	showNotification: showNotificationMock
}));

vi.mock('@services/summaryBuilder', () => ({
	getSummaryForTarget: () => 'summary',
	buildSummaryLinkTitle: () => 'User:Example/script.js'
}));

vi.mock('@utils/wikitext', () => ({
	getWikitextWithMeta: getWikitextWithMetaMock
}));

describe('normalize service', () => {
	beforeEach(() => {
		getApiForTargetMock.mockReset();
		getWikitextWithMetaMock.mockReset();
		showNotificationMock.mockReset();
		globalThis.mw = {
			config: {
				get: vi.fn((key) => (key === 'wgServerName' ? 'ru.wikipedia.org' : 'Iniquity'))
			}
		};
	});

	it('includes revision metadata when saving normalized content', async () => {
		const postWithEditToken = vi.fn().mockResolvedValue({});
		getApiForTargetMock.mockReturnValue({ postWithEditToken });
		getWikitextWithMetaMock.mockResolvedValue({
			content: "importScript('User:Example/script.js');\n",
			revid: 101,
			basetimestamp: '2026-01-01T00:00:00Z',
			starttimestamp: '2026-01-01T00:00:01Z'
		});

		const { normalize } = await import('@services/normalize');
		const changed = await normalize('common');

		expect(changed).toBe(true);
		expect(postWithEditToken).toHaveBeenCalledWith(
			expect.objectContaining({
				baserevid: 101,
				basetimestamp: '2026-01-01T00:00:00Z',
				starttimestamp: '2026-01-01T00:00:01Z'
			})
		);
	});
});
