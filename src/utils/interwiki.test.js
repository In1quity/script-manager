import { describe, expect, it } from 'vitest';
import { getProjectPrefix, urlToInterwiki } from '@utils/interwiki';

describe('getProjectPrefix', () => {
	it('returns language-aware prefixes for wikipedia-family projects', () => {
		expect(getProjectPrefix('en.wikipedia')).toBe('w:en');
		expect(getProjectPrefix('ru.wiktionary')).toBe('wikt:ru');
		expect(getProjectPrefix('de.wikivoyage')).toBe('voyage:de');
	});

	it('returns prefixes for wikimedia and special projects', () => {
		expect(getProjectPrefix('commons.wikimedia')).toBe('c');
		expect(getProjectPrefix('meta.wikimedia')).toBe('meta');
		expect(getProjectPrefix('mediawiki')).toBe('mw');
		expect(getProjectPrefix('wikidata')).toBe('d');
	});

	it('returns null for unknown or invalid values', () => {
		expect(getProjectPrefix('example.com')).toBeNull();
		expect(getProjectPrefix('')).toBeNull();
		expect(getProjectPrefix(null)).toBeNull();
	});
});

describe('urlToInterwiki', () => {
	it('converts index.php title URLs', () => {
		expect(urlToInterwiki('//en.wikipedia.org/w/index.php?title=User:Foo')).toBe('w:en:User:Foo');
	});

	it('converts /wiki/ URLs and decodes underscores', () => {
		expect(urlToInterwiki('https://www.mediawiki.org/wiki/Script_Manager')).toBe('mw:Script Manager');
	});

	it('returns null for non-project URLs', () => {
		expect(urlToInterwiki('https://example.com/wiki/Foo')).toBeNull();
	});
});
