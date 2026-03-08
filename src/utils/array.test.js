import { describe, expect, it } from 'vitest';
import { uniques } from '@utils/array';

describe('uniques', () => {
	it('removes duplicate primitive values while preserving order', () => {
		expect(uniques([ 'a', 'b', 'a', 1, 1, 'b' ])).toEqual([ 'a', 'b', 1 ]);
	});

	it('returns an empty array for empty input', () => {
		expect(uniques([])).toEqual([]);
	});

	it('returns an empty array for non-array input', () => {
		expect(uniques(null)).toEqual([]);
		expect(uniques('not-array')).toEqual([]);
	});
});
