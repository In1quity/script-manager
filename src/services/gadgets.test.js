import { describe, expect, it } from 'vitest';
import { gadgetMatchesFilter } from '@services/gadgets';

describe('gadgetMatchesFilter', () => {
	const gadget = {
		name: 'HotCat',
		description: '<span>Adds a <b>category</b> helper</span>',
		section: 'editing'
	};

	it('keeps all gadgets when query is empty', () => {
		expect(gadgetMatchesFilter('HotCat', gadget, '')).toBe(true);
		expect(gadgetMatchesFilter('HotCat', gadget, '   ')).toBe(true);
	});

	it('matches gadget name case-insensitively', () => {
		expect(gadgetMatchesFilter('HotCat', gadget, 'hot')).toBe(true);
		expect(gadgetMatchesFilter('HotCat', gadget, 'HOTCAT')).toBe(true);
	});

	it('matches gadget names with underscores as spaces', () => {
		expect(gadgetMatchesFilter('twinkle_diff', { name: 'twinkle_diff' }, 'twinkle diff')).toBe(true);
	});

	it('matches HTML-stripped description text', () => {
		expect(gadgetMatchesFilter('HotCat', gadget, 'category helper')).toBe(true);
		expect(gadgetMatchesFilter('HotCat', gadget, 'span')).toBe(false);
	});

	it('matches section id and localized section label', () => {
		expect(gadgetMatchesFilter('HotCat', gadget, 'editing')).toBe(true);
		expect(gadgetMatchesFilter('HotCat', gadget, 'редактирование', 'Редактирование')).toBe(true);
	});

	it('rejects gadgets that do not match the query', () => {
		expect(gadgetMatchesFilter('HotCat', gadget, 'navbox')).toBe(false);
	});
});
