import { describe, expect, it } from 'vitest';
import { isCodeContentModel } from '@utils/mediawiki';

describe('isCodeContentModel', () => {
	it('treats javascript and css models as code pages', () => {
		expect(isCodeContentModel('javascript')).toBe(true);
		expect(isCodeContentModel('css')).toBe(true);
		expect(isCodeContentModel('sanitized-css')).toBe(true);
		expect(isCodeContentModel('JavaScript')).toBe(true);
	});

	it('rejects wikitext and empty models', () => {
		expect(isCodeContentModel('wikitext')).toBe(false);
		expect(isCodeContentModel('')).toBe(false);
		expect(isCodeContentModel()).toBe(false);
	});
});
