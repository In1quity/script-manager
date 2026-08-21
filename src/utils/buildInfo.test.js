import { afterEach, describe, expect, it } from 'vitest';
import { formatBuildDate, getBuildInfo } from '@utils/buildInfo';

describe('getBuildInfo', () => {
	it('returns the Vite-injected version and build date', () => {
		expect(getBuildInfo()).toEqual({
			version: SM_VERSION,
			buildDate: BUILD_DATE
		});
	});
});

describe('formatBuildDate', () => {
	afterEach(() => {
		delete globalThis.mw;
	});

	it('formats an ISO date in the requested locale', () => {
		expect(formatBuildDate('2026-08-21', 'en')).toBe('August 21, 2026');
		expect(formatBuildDate('2026-08-21', 'ru')).toMatch(/21/);
	});

	it('uses the MediaWiki user language when no locale is passed', () => {
		globalThis.mw = {
			config: {
				get(key) {
					return key === 'wgUserLanguage' ? 'en' : null;
				}
			}
		};
		expect(formatBuildDate('2026-01-15')).toBe('January 15, 2026');
	});

	it('returns the original value when the date is not ISO', () => {
		expect(formatBuildDate('dev')).toBe('dev');
		expect(formatBuildDate('')).toBe('');
	});
});
