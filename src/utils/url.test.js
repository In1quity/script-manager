import { describe, expect, it } from 'vitest';
import { decodeSafe } from '@utils/url';

describe('decodeSafe', () => {
	it('decodes valid encoded strings', () => {
		expect(decodeSafe('User%3AFoo%20Bar')).toBe('User:Foo Bar');
	});

	it('removes a trailing ampersand before decode', () => {
		expect(decodeSafe('User%3AFoo%20Bar&')).toBe('User:Foo Bar');
	});

	it('returns original text on invalid escape sequences', () => {
		expect(decodeSafe('User%ZZ')).toBe('User%ZZ');
	});
});
