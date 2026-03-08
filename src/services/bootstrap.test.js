import { describe, expect, it } from 'vitest';
import { getEffectiveUserLanguage, normalizeLangCode } from '@services/bootstrap';

describe('normalizeLangCode', () => {
	it('normalizes language code casing and region suffix', () => {
		expect(normalizeLangCode('ru')).toBe('ru');
		expect(normalizeLangCode('RU')).toBe('ru');
		expect(normalizeLangCode('ru-RU')).toBe('ru');
	});

	it('returns undefined for empty or invalid values', () => {
		expect(normalizeLangCode('')).toBeUndefined();
		expect(normalizeLangCode('   ')).toBeUndefined();
		expect(normalizeLangCode(null)).toBeUndefined();
		expect(normalizeLangCode(undefined)).toBeUndefined();
	});
});

describe('getEffectiveUserLanguage', () => {
	it('returns uselang from URL when present', () => {
		const context = {
			runtime: {
				window: {
					location: {
						search: '?title=Foo&uselang=ru'
					}
				}
			}
		};
		expect(getEffectiveUserLanguage(context)).toBe('ru');
	});

	it('returns undefined when uselang is absent', () => {
		const context = {
			runtime: {
				window: {
					location: {
						search: '?title=Foo'
					}
				}
			}
		};
		expect(getEffectiveUserLanguage(context)).toBeUndefined();
	});
});
