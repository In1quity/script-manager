import { describe, expect, it } from 'vitest';
import {
	CAPTURE_BLOCK_END_RGX,
	CAPTURE_BLOCK_START_RGX,
	CAPTURE_ITEM_END_RGX,
	CAPTURE_ITEM_START_RGX
} from '@constants/capture';

describe('capture marker regexes', () => {
	it('matches capture block start and end markers', () => {
		expect(CAPTURE_BLOCK_START_RGX.test('// SM-CAPTURE-START')).toBe(true);
		expect(CAPTURE_BLOCK_START_RGX.test('	//   SM-CAPTURE-START')).toBe(true);
		expect(CAPTURE_BLOCK_START_RGX.test('// SM-CAPTURE-END')).toBe(false);

		expect(CAPTURE_BLOCK_END_RGX.test('// SM-CAPTURE-END')).toBe(true);
		expect(CAPTURE_BLOCK_END_RGX.test('	//   SM-CAPTURE-END')).toBe(true);
		expect(CAPTURE_BLOCK_END_RGX.test('// SM-CAPTURE-START')).toBe(false);
	});

	it('matches capture item start and end markers', () => {
		expect(CAPTURE_ITEM_START_RGX.test('// SM-CAPTURE-ITEM-START')).toBe(true);
		expect(CAPTURE_ITEM_START_RGX.test('// SM-CAPTURE-ITEM-END')).toBe(false);
		expect(CAPTURE_ITEM_END_RGX.test('// SM-CAPTURE-ITEM-END')).toBe(true);
		expect(CAPTURE_ITEM_END_RGX.test('// SM-CAPTURE-ITEM-START')).toBe(false);
	});
});
