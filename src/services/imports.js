import {
	CAPTURE_BLOCK_END_RGX,
	CAPTURE_BLOCK_START_RGX,
	CAPTURE_ITEM_END_RGX,
	CAPTURE_ITEM_START_RGX
} from '@constants/capture';
import { SM_DOC_REFERENCE_SCAN_LIMIT } from '@constants/config';
import { getApiForTarget } from '@services/api';
import { getStrings, t as translate } from '@services/i18n';
import { showNotification } from '@services/notification';
import { buildSummaryLinkTitle, getSummaryForTarget } from '@services/summaryBuilder';
import { escapeForJsComment, escapeForJsString, escapeForRegex, unescapeForJsString } from '@utils/escape';
import { createLogger } from '@utils/logger';
import { getServerName, getUserName, normalizeMediaWikiHost } from '@utils/mediawiki';
import { fetchWithTimeout } from '@utils/network';
import { decodeSafe } from '@utils/url';
import { getWikitext } from '@utils/wikitext';

const URL_RGX = /^(?:https?:)?\/\/(.+?)\.org\/w\/index\.php\?.*?title=(.+?(?:&|$))/;
const IMPORT_RGX = /^\s*(\/\/)?\s*importScript\s*\(\s*(['"])\s*(.+?)\s*\2\s*\)\s*;?/;
const LOADER_RGX =
	/^\s*(\/\/)?\s*mw\s*\.\s*loader\s*\.\s*load\s*\(\s*(['"])\s*(.+?)\s*\2\s*(?:,\s*(['"])\s*(?:text\/css|application\/css|text\/javascript|application\/javascript)\s*\4\s*)?\)\s*;?/;
const logger = createLogger('service.imports');

function extractDocumentationReference(text) {
	const source = String(text || '');
	const patterns = [
		/@documentation\s+([^\s*]+)/i,
		/Documentation:\s*(\S+)/,
		/@see\s+([^\s*]+)/i
	];

	for (const pattern of patterns) {
		const match = pattern.exec(source);
		if (match?.[1]) {
			return match[1];
		}
	}

	return null;
}

function getCaptureBlockRange(lines, lineIndex) {
	let start = -1;
	for (let i = lineIndex; i >= 0; i--) {
		if (CAPTURE_BLOCK_START_RGX.test(lines[i])) {
			start = i;
			break;
		}
		if (CAPTURE_BLOCK_END_RGX.test(lines[i])) {
			return null;
		}
	}
	if (start < 0) {
		return null;
	}

	let end = -1;
	for (let i = lineIndex; i < lines.length; i++) {
		if (CAPTURE_BLOCK_END_RGX.test(lines[i])) {
			end = i;
			break;
		}
		if (i !== lineIndex && CAPTURE_BLOCK_START_RGX.test(lines[i])) {
			return null;
		}
	}
	if (end < 0 || end < start) {
		return null;
	}

	return { start, end };
}

function getCaptureItemRange(lines, lineIndex) {
	let start = -1;
	for (let i = lineIndex; i >= 0; i--) {
		if (CAPTURE_ITEM_START_RGX.test(lines[i])) {
			start = i;
			break;
		}
		if (CAPTURE_ITEM_END_RGX.test(lines[i])) {
			return null;
		}
	}
	if (start < 0) {
		return null;
	}

	let end = -1;
	for (let i = lineIndex; i < lines.length; i++) {
		if (CAPTURE_ITEM_END_RGX.test(lines[i])) {
			end = i;
			break;
		}
		if (i !== lineIndex && CAPTURE_ITEM_START_RGX.test(lines[i])) {
			return null;
		}
	}
	if (end < 0 || end < start) {
		return null;
	}

	return { start, end };
}

export class Import {
	constructor(options = {}) {
		const {
			page = null,
			wiki: wikiValue = null,
			url: urlValue = null,
			target: targetValue = 'common',
			disabled: disabledValue = false,
			captured: capturedValue = false,
			captureName: captureNameValue = ''
		} = options;
		this.page = page;
		this.wiki = wikiValue;
		this.url = urlValue;
		this.target = targetValue;
		this.disabled = Boolean(disabledValue);
		this.captured = Boolean(capturedValue);
		this.captureName = captureNameValue || '';
		this.type = this.url ? 2 : this.wiki ? 1 : 0;
	}

	static ofLocal(page, target, disabled = false) {
		return new Import({ page, target, disabled });
	}

	static ofUrl(url, target, disabled = false) {
		let match;
		if ((match = URL_RGX.exec(String(url || '')))) {
			return new Import({
				page: decodeSafe(match[2]),
				wiki: decodeSafe(match[1]),
				target,
				disabled
			});
		}

		return new Import({ url, target, disabled });
	}

	static fromJs(line, target = 'common') {
		let match;
		if ((match = IMPORT_RGX.exec(String(line || '')))) {
			return Import.ofLocal(unescapeForJsString(match[3]), target, Boolean(match[1]));
		}

		if ((match = LOADER_RGX.exec(String(line || '')))) {
			return Import.ofUrl(unescapeForJsString(match[3]), target, Boolean(match[1]));
		}

		return null;
	}

	static getUserName() {
		return getUserName();
	}

	static getServerName() {
		return getServerName();
	}

	static getTargetTitle(target) {
		const cleanTarget = target || 'common';
		return `User:${Import.getUserName()}/${cleanTarget}.js`;
	}

	toLoaderUrl(serverName) {
		let url;
		if (this.type === 2) {
			url = this.url;
		} else {
			const host = normalizeMediaWikiHost(this.type === 1 ? `${this.wiki}.org` : serverName);
			const pageTitle = this.page;
			const isCss = /\.css$/i.test(String(pageTitle || ''));
			const ctype = isCss ? 'text/css' : 'text/javascript';
			url = `//${host}/w/index.php?title=${pageTitle}&action=raw&ctype=${ctype}`;
		}
		return url.replace(/\/\/mediawiki\.org\b/i, '//www.mediawiki.org');
	}

	toJs(serverName) {
		const disabledPrefix = this.disabled ? '//' : '';
		const url = this.toLoaderUrl(serverName);
		const isCss = /\.css($|[?#])/i.test(String(url || ''));
		const typeArg = isCss ? ", 'text/css'" : '';
		const backlinkText =
			this.target === 'global'
				? getStrings().fallback['label-backlink']
				: translate('label-backlink');
		const summaryLinkTitle = buildSummaryLinkTitle(this);
		const suffix = this.type === 2 ? '' : ` // ${backlinkText} [[${escapeForJsComment(summaryLinkTitle)}]]`;
		return `${disabledPrefix}mw.loader.load('${escapeForJsString(url)}'${typeArg});${suffix}`;
	}

	getDescription(useWikitext = false) {
		switch (this.type) {
			case 0:
				return useWikitext ? `[[${buildSummaryLinkTitle(this)}]]` : this.getDisplayName();
			case 1:
				if (useWikitext) {
					return `[[${buildSummaryLinkTitle(this)}]]`;
				}
				return this.getDisplayName();
			default:
				return this.getDisplayName();
		}
	}

	getDisplayName() {
		if (this.type === 2) {
			return this.url || '';
		}
		return this.page || '';
	}

	getSourceLabel() {
		if (this.type !== 1 || !this.wiki) {
			return '';
		}
		return translate('label-loaded-from').replace('$1', this.wiki);
	}

	getKey() {
		switch (this.type) {
			case 0:
				return `local:${this.target || 'common'}:${this.page || ''}`;
			case 1:
				return `remote:${this.target || 'common'}:${this.wiki || ''}:${this.page || ''}`;
			default:
				return `url:${this.target || 'common'}:${this.url || ''}`;
		}
	}

	async resolveDocumentationInterwiki() {
		try {
			if (this.type === 2 || !this.page) {
				return null;
			}
			const host = normalizeMediaWikiHost(this.type === 1 && this.wiki ? `${this.wiki}.org` : Import.getServerName());
			const rawUrl = `//${host}/w/index.php?title=${encodeURIComponent(this.page)}&action=raw&ctype=text/javascript`;
			const response = await fetchWithTimeout(rawUrl);
			if (!response.ok) {
				return null;
			}
			const text = await response.text();
			const head = text.slice(0, SM_DOC_REFERENCE_SCAN_LIMIT);
			const docRef = extractDocumentationReference(head);
			if (!docRef) {
				return null;
			}
			return docRef;
		} catch (error) {
			logger.warn('Failed to resolve documentation interwiki', error);
			return null;
		}
	}

	getLineNums(targetWikitext) {
		const quoted = (text) => new RegExp(`(['"])${escapeForRegex(text)}\\1`);
		let toFind = null;
		let titleInUrlPattern = null;

		if (this.type === 0) {
			toFind = quoted(escapeForJsString(this.page));
			const page = String(this.page || '').trim();
			if (page) {
				// mw.loader.load('//host/...?title=PAGE&...') or title= encoded; line may start with "// " when disabled
				titleInUrlPattern = new RegExp(
					`title=${escapeForRegex(page)}([&\\s]|$)|title=${escapeForRegex(encodeURIComponent(page))}([&\\s]|$)`
				);
			}
		} else if (this.type === 1) {
			const pageName = String(this.page || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			toFind = new RegExp(pageName);
		} else if (this.type === 2) {
			toFind = quoted(escapeForJsString(this.url));
		}

		if (!toFind && !titleInUrlPattern) {
			return [];
		}

		const lineMatches = (line) =>
			(toFind && toFind.test(line)) || (titleInUrlPattern && titleInUrlPattern.test(line));

		const lines = String(targetWikitext || '').split('\n');
		const indexes = new Set();
		for (let index = 0; index < lines.length; index++) {
			if (lineMatches(lines[index])) {
				const itemRange = getCaptureItemRange(lines, index);
				const blockRange = itemRange || getCaptureBlockRange(lines, index);
				if (blockRange) {
					for (let i = blockRange.start; i <= blockRange.end; i++) {
						indexes.add(i);
					}
				} else {
					indexes.add(index);
				}
			}
		}
		return Array.from(indexes).sort((a, b) => a - b);
	}

	install() {
		return this.updateInTarget('install');
	}

	uninstall() {
		return this.updateInTarget('uninstall');
	}

	setDisabled(disabled) {
		return (async () => {
			const target = this.target || 'common';
			const targetApi = getApiForTarget(target);
			if (!targetApi) {
				throw new Error(`API is unavailable for target "${target}"`);
			}
			const title = Import.getTargetTitle(target);
			const current = await getWikitext(targetApi, title);
			const lines = String(current || '').split('\n');
			const lineNums = this.getLineNums(current);

			lineNums.forEach((lineNum) => {
				if (disabled) {
					if (!/^\s*\/\//.test(lines[lineNum])) {
						lines[lineNum] = lines[lineNum].replace(/^(\s*)(?!\/\/)/, '$1//');
					}
				} else if (/^\s*\/\//.test(lines[lineNum])) {
					lines[lineNum] = lines[lineNum].replace(/^(\s*)\/\/\s?/, '$1');
				}
			});

			this.disabled = Boolean(disabled);
			try {
				await targetApi.postWithEditToken({
					action: 'edit',
					title,
					text: lines.join('\n'),
					summary: getSummaryForTarget(
						target,
						disabled ? 'summary-disable' : 'summary-enable',
						this.getDescription(true),
						getStrings()
					),
					formatversion: 2
				});
			} catch (error) {
				logger.error('Failed to persist disabled state', error);
				throw error;
			}
			showNotification(
				disabled ? 'notification-disable-success' : 'notification-enable-success',
				'success',
				this.getDisplayName()
			);
			return true;
		})();
	}

	toggleDisabled() {
		return this.setDisabled(!this.disabled);
	}

	move(newTarget) {
		return (async () => {
			if (!newTarget || this.target === newTarget) {
				return false;
			}
			const old = new Import({
				page: this.page,
				wiki: this.wiki,
				url: this.url,
				target: this.target,
				disabled: this.disabled
			});
			this.target = newTarget;

			await this.install();
			await old.uninstall();
			showNotification('notification-move-success', 'success', this.getDisplayName());
			return true;
		})();
	}

	async updateInTarget(mode) {
		const target = this.target || 'common';
		const api = getApiForTarget(target);
		if (!api) {
			throw new Error(`API is unavailable for target "${target}"`);
		}
		const title = Import.getTargetTitle(target);
		const current = await getWikitext(api, title);
		const line = this.toJs(mw.config.get('wgServerName'));
		const lines = String(current || '').split('\n');
		let next = String(current || '');

		if (mode === 'install') {
			const existsByParsed = lines.some((candidate) => {
				const parsed = Import.fromJs(candidate, target);
				if (!parsed) {
					return false;
				}
				const parsedPage = String(parsed.page || '').toLowerCase();
				const thisPage = String(this.page || '').toLowerCase();
				if (parsedPage && thisPage && parsedPage === thisPage) {
					return true;
				}
				return Boolean(parsed.url && this.url && parsed.url === this.url);
			});
			if (!existsByParsed) {
				next = current.trimEnd() ? `${current.trimEnd()}\n${line}\n` : `${line}\n`;
			}
		} else if (mode === 'uninstall') {
			const lineNums = this.getLineNums(current);
			next = lines
				.filter((_, index) => lineNums.indexOf(index) < 0)
				.join('\n');
		}

		if (next === current) {
			return false;
		}

		try {
			await api.postWithEditToken({
				action: 'edit',
				title,
				text: next,
				summary: getSummaryForTarget(
					target,
					mode === 'install' ? 'summary-install' : 'summary-uninstall',
					this.getDescription(true),
					getStrings()
				),
				formatversion: 2
			});
		} catch (error) {
			logger.error(`Failed to ${mode} import`, error);
			throw error;
		}

		return true;
	}
}
