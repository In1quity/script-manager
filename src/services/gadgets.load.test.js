import { beforeEach, describe, expect, it, vi } from 'vitest';

const getApiMock = vi.fn();

vi.mock('@services/api', () => ({
	getApi: getApiMock
}));

vi.mock('@services/i18n', () => ({
	t: (_key, fallback) => fallback || ''
}));

describe('loadGadgets', () => {
	beforeEach(() => {
		vi.resetModules();
		getApiMock.mockReset();
	});

	it('keeps gadgets when hidden flag is false', async () => {
		const getMock = vi.fn().mockResolvedValue({
			query: {
				gadgets: [
					{
						id: 'hotcat',
						desc: 'HotCat',
						metadata: {
							settings: {
								section: 'editing',
								hidden: false,
								default: false
							}
						}
					}
				]
			}
		});
		getApiMock.mockReturnValue({ get: getMock });

		const { loadGadgets, getGadgetsData, getGadgetSectionOrder } = await import('@services/gadgets');
		await loadGadgets();

		expect(getGadgetsData()).toHaveProperty('hotcat');
		expect(getGadgetSectionOrder()).toEqual([ 'editing' ]);
	});

	it('filters gadgets only when hidden flag is enabled', async () => {
		const getMock = vi.fn().mockResolvedValue({
			query: {
				gadgets: [
					{
						id: 'hiddenOne',
						desc: 'Hidden one',
						metadata: {
							settings: {
								hidden: true
							}
						}
					},
					{
						id: 'visibleOne',
						desc: 'Visible one',
						metadata: {
							settings: {
								hidden: false
							}
						}
					}
				]
			}
		});
		getApiMock.mockReturnValue({ get: getMock });

		const { loadGadgets, getGadgetsData } = await import('@services/gadgets');
		await loadGadgets();

		expect(getGadgetsData()).not.toHaveProperty('hiddenOne');
		expect(getGadgetsData()).toHaveProperty('visibleOne');
	});
});
