import { describe, expect, it } from 'vitest';
import {
	escapeForJsComment,
	escapeForJsString,
	escapeForRegex,
	unescapeForJsString
} from '@utils/escape';

describe('escape utils', () => {
	it('escapes regex metacharacters', () => {
		expect(escapeForRegex('.*+?^${}()|[]\\')).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
		expect(escapeForRegex('')).toBe('');
		expect(escapeForRegex(null)).toBe('');
	});

	it('escapes JavaScript string characters', () => {
		const source = '\'\\\r\n\u2028\u2029';
		expect(escapeForJsString(source)).toBe('\\\'\\\\\\r\\n\\u2028\\u2029');
	});

	it('unescapes JavaScript string characters', () => {
		const escaped = '\\\'\\\\\\r\\n\\u2028\\u2029';
		expect(unescapeForJsString(escaped)).toBe('\'\\\r\n\u2028\u2029');
	});

	it('escapes JavaScript comment terminator', () => {
		expect(escapeForJsComment('a*/b')).toBe('a*\\/b');
	});
});
