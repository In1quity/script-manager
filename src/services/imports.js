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
import { getCurrentSourceWiki, getServerName, getUserName, normalizeMediaWikiHost } from '@utils/mediawiki';
import { canonicalizeUserNamespace } from '@utils/namespace';
import { fetchWithTimeout } from '@utils/network';
import { runWithScriptLock } from '@utils/scriptLock';
import { decodeSafe } from '@utils/url';
import { getUserJsTitle } from '@utils/userJsTitle';
import { getWikitextWithMeta } from '@utils/wikitext';

const URL_RGX = /^(?:https?:)?\/\/(.+?)\.org\/w\/index\.php\?(?:.*?&)?title=([^&#]+)/;
const LOAD_PHP_RGX = /^(?:https?:)?\/\/(.+?)\.org\/w\/load\.php\?(?:.*?&)?modules=([^&#]+)/;
const IMPORT_RGX = /^\s*(\/\/)?\s*importScript\s*\(\s*(['"])\s*(.+?)\s*\2\s*\)\s*;?/;
const LOADER_RGX =
	/^\s*(\/\/)?\s*mw\s*\.\s*loader\s*\.\s*load\s*\(\s*(['"])\s*(.+?)\s*\2\s*(?:,\s*(['"])\s*(?:text\/css|application\/css|text\/javascript|application\/javascript)\s*\4\s*)?\)\s*;?/;
const logger = createLogger('service.imports');

function isEditConflictError(error) {
	const code = String(error?.code || '').toLowerCase();
	const info = String(error?.info || '').toLowerCase();
	const message = String(error?.message || '').toLowerCase();
	return code.includes('editconflict') || info.includes('editconflict') || message.includes('editconflict');
}

function getGadgetDocumentationPage(moduleName) {
	const primary = String(moduleName || '')
		.split('|')[0]
		.split(',')[0]
		.trim();
	const gadgetMatch = /^ext\.gadget\.(.+)$/i.exec(primary);
	if (!gadgetMatch) {
		return null;
	}
	return `MediaWiki:Gadget-${gadgetMatch[1]}`;
}

function isGadgetModuleName(value) {
	const name = String(value || '').trim();
	if (!name || /[/:?#\s|,]/.test(name)) {
		return false;
	}
	return Boolean(getGadgetDocumentationPage(name));
}

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

function extractRevisionContent(apiData) {
	const page = Array.isArray(apiData?.query?.pages) ? apiData.query.pages[0] : null;
	const revision = page?.revisions?.[0];
	const byContent = revision?.content;
	if (typeof byContent === 'string' && byContent) {
		return byContent;
	}
	const bySlot = revision?.slots?.main?.content;
	if (typeof bySlot === 'string' && bySlot) {
		return bySlot;
	}
	const byLegacy = revision?.['*'];
	if (typeof byLegacy === 'string' && byLegacy) {
		return byLegacy;
	}
	return '';
}

async function fetchScriptHead(host, pageTitle) {
	const apiUrl = `https://${host}/w/api.php`;
	try {
		if (mw?.ForeignApi) {
			const foreignApi = new mw.ForeignApi(apiUrl, {
				anonymous: true
			});
			const data = await foreignApi.get({
				action: 'query',
				prop: 'revisions',
				rvprop: 'content',
				rvslots: 'main',
				titles: pageTitle,
				format: 'json',
				formatversion: 2
			});
			return String(extractRevisionContent(data) || '').slice(0, SM_DOC_REFERENCE_SCAN_LIMIT);
		}
	} catch (error) {
		logger.debug('ForeignApi script fetch failed, trying fetch fallback', error);
	}

	const apiFetchUrl = `${apiUrl}?action=query&prop=revisions&rvprop=content&rvslots=main&titles=${encodeURIComponent(pageTitle)}&format=json&formatversion=2&origin=*`;
	const apiResponse = await fetchWithTimeout(apiFetchUrl);
	if (!apiResponse.ok) {
		return '';
	}
	const apiData = await apiResponse.json();
	return String(extractRevisionContent(apiData) || '').slice(0, SM_DOC_REFERENCE_SCAN_LIMIT);
}

function getMarkedRange(lines, lineIndex, startRgx, endRgx) {
	let start = -1;
	for (let i = lineIndex; i >= 0; i--) {
		if (startRgx.test(lines[i])) {
			start = i;
			break;
		}
		if (endRgx.test(lines[i])) {
			return null;
		}
	}
	if (start < 0) {
		return null;
	}

	let end = -1;
	for (let i = lineIndex; i < lines.length; i++) {
		if (endRgx.test(lines[i])) {
			end = i;
			break;
		}
		if (i !== lineIndex && startRgx.test(lines[i])) {
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
			captureName: captureNameValue = '',
			isModule: isModuleValue = false
		} = options;
		this.page = page;
		this.wiki = wikiValue;
		this.url = urlValue;
		this.target = targetValue;
		this.disabled = Boolean(disabledValue);
		this.captured = Boolean(capturedValue);
		this.captureName = captureNameValue || '';
		this.isModule = Boolean(isModuleValue);
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

		if ((match = LOAD_PHP_RGX.exec(String(url || '')))) {
			return new Import({
				page: decodeSafe(match[2]),
				wiki: decodeSafe(match[1]),
				target,
				disabled,
				isModule: true
			});
		}

		const moduleName = String(url || '').trim();
		if (isGadgetModuleName(moduleName)) {
			return new Import({
				page: moduleName,
				target,
				disabled,
				isModule: true
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
		return getUserJsTitle(cleanTarget, Import.getUserName());
	}

	toLoaderUrl(serverName) {
		let url;
		if (this.isModule) {
			const currentHost = normalizeMediaWikiHost(serverName);
			const moduleHost = this.wiki
				? normalizeMediaWikiHost(`${this.wiki}.org`)
				: currentHost;
			if (this.wiki && moduleHost.toLowerCase() !== currentHost.toLowerCase()) {
				url = `//${moduleHost}/w/load.php?modules=${this.page}`;
			} else {
				url = this.page;
			}
		} else if (this.type === 2) {
			url = this.url;
		} else {
			const host = normalizeMediaWikiHost(this.type === 1 ? `${this.wiki}.org` : serverName);
			const normalizedPageTitle = String(this.page || '').replace(/ /g, '_');
			const pageTitle = encodeURI(normalizedPageTitle);
			const isCss = /\.css$/i.test(String(pageTitle || ''));
			const ctype = isCss ? 'text/css' : 'text/javascript';
			url = `//${host}/w/index.php?title=${pageTitle}&action=raw&ctype=${ctype}`;
		}
		return String(url || '').replace(/\/\/mediawiki\.org\b/i, '//www.mediawiki.org');
	}

	getDocumentationPage() {
		if (this.isModule) {
			return getGadgetDocumentationPage(this.page) || this.page;
		}
		return this.page;
	}

	getHumanUrl() {
		if (this.type === 2) {
			return this.url || '';
		}
		const page = canonicalizeUserNamespace(this.getDocumentationPage());
		if (!page) {
			return '';
		}
		if (this.type === 0) {
			return `/wiki/${encodeURI(page)}`;
		}
		const host = normalizeMediaWikiHost(`${this.wiki}.org`);
		return `//${host}/wiki/${encodeURI(page)}`;
	}

	getSummaryLinkTitle() {
		return buildSummaryLinkTitle({
			type: this.type,
			page: this.getDocumentationPage(),
			wiki: this.wiki,
			target: this.target,
			docInterwiki: this.docInterwiki
		});
	}

	toJs(serverName) {
		const disabledPrefix = this.disabled ? '//' : '';
		const url = this.toLoaderUrl(serverName);
		const isCss = !this.isModule && /\.css($|[?#])/i.test(String(url || ''));
		const typeArg = isCss ? ", 'text/css'" : '';
		const backlinkText =
			this.target === 'global'
				? getStrings().fallback['label-backlink']
				: translate('label-backlink');
		const summaryLinkTitle = this.getSummaryLinkTitle();
		const suffix = this.type === 2 ? '' : ` // ${backlinkText} [[${escapeForJsComment(summaryLinkTitle)}]]`;
		return `${disabledPrefix}mw.loader.load('${escapeForJsString(url)}'${typeArg});${suffix}`;
	}

	getDescription(useWikitext = false) {
		if (useWikitext && (this.type === 0 || this.type === 1)) {
			return `[[${this.getSummaryLinkTitle()}]]`;
		}
		return this.getDisplayName();
	}

	getDisplayName() {
		if (this.type === 2) {
			return this.url || '';
		}
		return this.page || '';
	}

	getSourceLabel() {
		const wiki = this.wiki || (this.isModule ? getCurrentSourceWiki() : '');
		if (!wiki) {
			return '';
		}
		return translate('label-loaded-from').replace('$1', wiki);
	}

	getKey() {
		if (this.isModule) {
			return `module:${this.target || 'common'}:${this.wiki || ''}:${this.page || ''}`;
		}
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
			const gadgetDocPage = this.isModule ? getGadgetDocumentationPage(this.page) : null;
			if (this.isModule && !gadgetDocPage) {
				return null;
			}
			const docPage = gadgetDocPage || this.page;
			const host = normalizeMediaWikiHost(this.type === 1 && this.wiki ? `${this.wiki}.org` : Import.getServerName());
			const titles = gadgetDocPage ? [ `${docPage}.js`, docPage ] : [ this.page ];
			for (const title of titles) {
				const head = await fetchScriptHead(host, title);
				if (!head) {
					continue;
				}
				const docRef = extractDocumentationReference(head);
				if (docRef) {
					return docRef;
				}
			}
			return null;
		} catch (error) {
			logger.warn('Failed to resolve documentation interwiki', error);
			return null;
		}
	}

	getLineNums(targetWikitext) {
		const quoted = (text) => new RegExp(`(['"])${escapeForRegex(text)}\\1`);
		let toFind = null;
		let titleInUrlPattern = null;

		if (!this.isModule) {
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
				toFind = null;
			} else if (this.type === 2) {
				toFind = quoted(escapeForJsString(this.url));
			}

			if (!toFind && !titleInUrlPattern) {
				return [];
			}
		}

		const lineMatches = (line) => {
			if (this.isModule) {
				const parsed = Import.fromJs(line, this.target);
				return Boolean(parsed && parsed.getKey() === this.getKey());
			}
			if (this.type === 1) {
				const parsed = Import.fromJs(line, this.target);
				return Boolean(parsed && parsed.getKey() === this.getKey());
			}
			return (toFind && toFind.test(line)) || (titleInUrlPattern && titleInUrlPattern.test(line));
		};

		const lines = String(targetWikitext || '').split('\n');
		const indexes = new Set();
		for (let index = 0; index < lines.length; index++) {
			if (lineMatches(lines[index])) {
				const itemRange = getMarkedRange(lines, index, CAPTURE_ITEM_START_RGX, CAPTURE_ITEM_END_RGX);
				const blockRange = itemRange || getMarkedRange(lines, index, CAPTURE_BLOCK_START_RGX, CAPTURE_BLOCK_END_RGX);
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

	install(options = {}) {
		return this.updateInTarget('install', options);
	}

	uninstall(options = {}) {
		return this.updateInTarget('uninstall', options);
	}

	setDisabled(disabled) {
		return (async () => {
			const target = this.target || 'common';
			const targetApi = getApiForTarget(target);
			if (!targetApi) {
				throw new Error(`API is unavailable for target "${target}"`);
			}
			const title = Import.getTargetTitle(target);
			if (!title) {
				throw new Error('Target title is unavailable for current user');
			}
			const currentMeta = await getWikitextWithMeta(targetApi, title);
			const current = currentMeta.content;
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
					baserevid: currentMeta.revid,
					basetimestamp: currentMeta.basetimestamp,
					starttimestamp: currentMeta.starttimestamp,
					summary: getSummaryForTarget(
						target,
						disabled ? 'summary-disable' : 'summary-enable',
						this.getDescription(true),
						getStrings()
					),
					formatversion: 2
				});
			} catch (error) {
				if (isEditConflictError(error)) {
					showNotification('notification-general-error', 'error');
				}
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
		const lockKey = this.getDisplayName() || this.getKey();
		return runWithScriptLock(lockKey, async () => {
			if (!newTarget || this.target === newTarget) {
				return false;
			}
			const oldTarget = this.target;
			const old = new Import({
				page: this.page,
				wiki: this.wiki,
				url: this.url,
				target: oldTarget,
				disabled: this.disabled,
				isModule: this.isModule
			});
			const installedInTarget = new Import({
				page: this.page,
				wiki: this.wiki,
				url: this.url,
				target: newTarget,
				disabled: this.disabled,
				isModule: this.isModule
			});

			const moveOptions = { moveFromTarget: oldTarget };
			if (newTarget === 'global') {
				moveOptions.moveSourceProject = getServerName();
			}
			await installedInTarget.install(moveOptions);
			try {
				await old.uninstall({ moveToTarget: newTarget });
			} catch (error) {
				try {
					await installedInTarget.uninstall({ moveToTarget: oldTarget });
				} catch (rollbackError) {
					logger.error('Failed to rollback move after uninstall failure', rollbackError);
				}
				throw error;
			}
			this.target = newTarget;
			showNotification('notification-move-success', 'success', this.getDisplayName());
			return true;
		});
	}

	async updateInTarget(mode, options = {}) {
		const target = this.target || 'common';
		const api = getApiForTarget(target);
		if (!api) {
			throw new Error(`API is unavailable for target "${target}"`);
		}
		const title = Import.getTargetTitle(target);
		if (!title) {
			throw new Error('Target title is unavailable for current user');
		}
		const currentMeta = await getWikitextWithMeta(api, title);
		const current = currentMeta.content;
		const line = this.toJs(mw.config.get('wgServerName'));
		const lines = String(current || '').split('\n');
		let next = String(current || '');

		if (mode === 'install') {
			const existsByParsed = lines.some((candidate) => {
				const parsed = Import.fromJs(candidate, target);
				if (!parsed) {
					return false;
				}
				if (parsed.getKey() === this.getKey()) {
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

		const isMoveInstall = mode === 'install' && options.moveFromTarget;
		const isMoveUninstall = mode === 'uninstall' && options.moveToTarget;
		const summaryKey = isMoveInstall
			? (options.moveSourceProject ? 'summary-move-to-global' : 'summary-move-to')
			: isMoveUninstall
				? 'summary-move-from'
				: mode === 'install'
					? 'summary-install'
					: 'summary-uninstall';
		const replacements = isMoveInstall
			? options.moveSourceProject
				? { $2: options.moveFromTarget, $3: options.moveSourceProject }
				: { $2: options.moveFromTarget }
			: isMoveUninstall
				? { $2: options.moveToTarget }
				: {};

		try {
			await api.postWithEditToken({
				action: 'edit',
				title,
				text: next,
				baserevid: currentMeta.revid,
				basetimestamp: currentMeta.basetimestamp,
				starttimestamp: currentMeta.starttimestamp,
				summary: getSummaryForTarget(
					target,
					summaryKey,
					this.getDescription(true),
					getStrings(),
					replacements
				),
				formatversion: 2
			});
		} catch (error) {
			if (isEditConflictError(error)) {
				showNotification('notification-general-error', 'error');
			}
			logger.error(`Failed to ${mode} import`, error);
			throw error;
		}

		return true;
	}
}
