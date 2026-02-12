import { getApiForTarget } from '@services/api';
import { getStrings, t } from '@services/i18n';
import { showNotification } from '@services/notification';
import { getSummaryForTarget } from '@services/summaryBuilder';
import { loadVueCodex } from '@utils/codex';
import { escapeForJsString } from '@utils/escape';
import { createLogger } from '@utils/logger';
import { getWikitext } from '@utils/wikitext';

const logger = createLogger('component.captureDialog');
const CAPTURE_FALLBACK_DELAY_MS = 5000;
const CAPTURE_BLOCK_START = '// SM-CAPTURE-START';
const CAPTURE_BLOCK_END = '// SM-CAPTURE-END';
const CAPTURE_ITEM_START = '// SM-CAPTURE-ITEM-START';
const CAPTURE_ITEM_END = '// SM-CAPTURE-ITEM-END';
const CAPTURE_BLOCK_START_RGX = /^\s*\/\/\s*SM-CAPTURE-START\b/;
const CAPTURE_BLOCK_END_RGX = /^\s*\/\/\s*SM-CAPTURE-END\b/;
const CAPTURE_ITEM_START_RGX = /^\s*\/\/\s*SM-CAPTURE-ITEM-START\b/;
const CAPTURE_ITEM_END_RGX = /^\s*\/\/\s*SM-CAPTURE-ITEM-END\b/;
const CAPTURE_KEY_LINE_RGX = /key:\s*("(?:\\.|[^"])*")\s*,?\s*$/;
const CAPTURE_NAME_LINE_RGX = /name:\s*("(?:\\.|[^"])*")\s*,?\s*$/;
const LOADER_LOAD_LINE_RGX = /(mw\s*\.\s*loader\s*\.\s*load\s*\(.*\)\s*;)\s*$/;

function safeUnmount(app, root) {
	try {
		if (app && typeof app.unmount === 'function') {
			app.unmount();
		}
	} catch {
		// Ignore unmount race conditions.
	}
	try {
		if (root?.parentNode) {
			root.parentNode.removeChild(root);
		}
	} catch {
		// Ignore already removed roots.
	}
}

function parseJsonStringToken(token, fallback = '') {
	try {
		const parsed = JSON.parse(token);
		return typeof parsed === 'string' ? parsed : fallback;
	} catch {
		return fallback;
	}
}

function normalizeLoadCall(call) {
	return String(call || '').replace(/\s+/g, '');
}

function extractLoadCall(line) {
	const match = LOADER_LOAD_LINE_RGX.exec(String(line || ''));
	return match ? match[1] : '';
}

function buildCapturedLoadCall(anImport) {
	const serverName = mw?.config?.get?.('wgServerName') || '';
	const loaderUrl = anImport.toLoaderUrl(serverName);
	const isCss = /\.css($|[?#])/i.test(String(loaderUrl || ''));
	const typeArg = isCss ? ", 'text/css'" : '';
	return `mw.loader.load('${escapeForJsString(loaderUrl)}'${typeArg});`;
}

function buildCaptureItem(anImport, captureName) {
	const fallbackName = (anImport.getDisplayName() || '').replace(/_/g, ' ') || 'Captured script';
	return {
		key: anImport.getKey(),
		name: String(captureName || '').trim() || fallbackName,
		loadCall: buildCapturedLoadCall(anImport)
	};
}

function dedupeCaptureItems(items) {
	const seen = new Set();
	return items.filter((item) => {
		const signature = (item.key || '').trim() || normalizeLoadCall(item.loadCall);
		if (!signature || seen.has(signature)) {
			return false;
		}
		seen.add(signature);
		return true;
	});
}

function findCaptureBlocks(lines) {
	const blocks = [];
	let openStart = -1;
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		if (CAPTURE_BLOCK_START_RGX.test(line)) {
			openStart = index;
			continue;
		}
		if (openStart >= 0 && CAPTURE_BLOCK_END_RGX.test(line)) {
			blocks.push({ start: openStart, end: index });
			openStart = -1;
		}
	}
	return blocks;
}

function parseItemFromLines(lines, start, end) {
	let key = '';
	let name = '';
	let loadCall = '';
	for (let index = start; index <= end; index++) {
		const line = lines[index];
		const keyMatch = CAPTURE_KEY_LINE_RGX.exec(line);
		if (keyMatch && !key) {
			key = parseJsonStringToken(keyMatch[1], '');
		}
		const nameMatch = CAPTURE_NAME_LINE_RGX.exec(line);
		if (nameMatch && !name) {
			name = parseJsonStringToken(nameMatch[1], '');
		}
		const call = extractLoadCall(line);
		if (call && !loadCall) {
			loadCall = call;
		}
	}
	if (!loadCall) {
		return null;
	}
	return {
		key: key || '',
		name: name || '',
		loadCall
	};
}

function parseCaptureItemsFromBlock(lines, start, end) {
	const items = [];
	let itemStart = -1;
	for (let index = start; index <= end; index++) {
		const line = lines[index];
		if (CAPTURE_ITEM_START_RGX.test(line)) {
			itemStart = index;
			continue;
		}
		if (itemStart >= 0 && CAPTURE_ITEM_END_RGX.test(line)) {
			const parsed = parseItemFromLines(lines, itemStart, index);
			if (parsed) {
				items.push(parsed);
			}
			itemStart = -1;
		}
	}
	if (items.length) {
		return items;
	}

	// Legacy fallback: one capture block may contain one load call and optional name line.
	const legacy = parseItemFromLines(lines, start, end);
	return legacy ? [ legacy ] : [];
}

function parseCaptureItems(lines, blocks) {
	return dedupeCaptureItems(
		blocks.flatMap((block) => parseCaptureItemsFromBlock(lines, block.start, block.end))
	);
}

function renderCaptureWrapperLines(items) {
	const lines = [
		CAPTURE_BLOCK_START,
		'(function () {',
		'\tconst smCaptureItems = ['
	];
	items.forEach((item, index) => {
		lines.push(`\t\t${CAPTURE_ITEM_START}`);
		lines.push('\t\t{');
		lines.push(`\t\t\tkey: ${JSON.stringify(String(item.key || ''))},`);
		lines.push(`\t\t\tname: ${JSON.stringify(String(item.name || ''))},`);
		lines.push('\t\t\tfn: function scriptsToManage() {');
		lines.push(`\t\t\t\t${String(item.loadCall || '').trim()}`);
		lines.push('\t\t\t}');
		lines.push(index < items.length - 1 ? '\t\t},' : '\t\t}');
		lines.push(`\t\t${CAPTURE_ITEM_END}`);
	});
	lines.push('\t];');
	lines.push('\tlet smCaptured = false;');
	lines.push('\tlet smCaptureEnabled = false;');
	lines.push('\ttry {');
	lines.push('\t\tconst smRawSettings = mw && mw.user && mw.user.options && typeof mw.user.options.get === \'function\'');
	lines.push('\t\t\t? mw.user.options.get(\'userjs-sm-settings\')');
	lines.push('\t\t\t: \'\';');
	lines.push('\t\tif (smRawSettings) {');
	lines.push('\t\t\tconst smParsedSettings = JSON.parse(smRawSettings);');
	lines.push('\t\t\tsmCaptureEnabled = Boolean(smParsedSettings && smParsedSettings.captureEnabled === true);');
	lines.push('\t\t}');
	lines.push('\t} catch {}');
	lines.push('\tif (!smCaptureEnabled) {');
	lines.push('\t\tsmCaptureItems.forEach(function (item) {');
	lines.push('\t\t\titem.fn();');
	lines.push('\t\t});');
	lines.push('\t\treturn;');
	lines.push('\t}');
	lines.push('\tif (!mw || typeof mw.hook !== \'function\') {');
	lines.push('\t\tsmCaptureItems.forEach(function (item) {');
	lines.push('\t\t\titem.fn();');
	lines.push('\t\t});');
	lines.push('\t\treturn;');
	lines.push('\t}');
	lines.push('\tconst smCapturePayload = smCaptureItems.map(function (item) {');
	lines.push('\t\treturn {');
	lines.push('\t\t\tkey: item.key,');
	lines.push('\t\t\tname: item.name,');
	lines.push('\t\t\tfn: function () {');
	lines.push('\t\t\t\tsmCaptured = true;');
	lines.push('\t\t\t\titem.fn();');
	lines.push('\t\t\t}');
	lines.push('\t\t};');
	lines.push('\t});');
	lines.push('\tmw.hook(\'scriptManager.capture\').fire({ items: smCapturePayload });');
	lines.push('\tsetTimeout(function () {');
	lines.push('\t\tif (!smCaptured) {');
	lines.push('\t\t\tsmCaptureItems.forEach(function (item) {');
	lines.push('\t\t\t\titem.fn();');
	lines.push('\t\t\t});');
	lines.push('\t\t}');
	lines.push(`\t}, ${CAPTURE_FALLBACK_DELAY_MS});`);
	lines.push('})();');
	lines.push(CAPTURE_BLOCK_END);
	return lines;
}

function getTargetTitle(anImport, target) {
	const staticResolver = anImport?.constructor?.getTargetTitle;
	if (typeof staticResolver === 'function') {
		return staticResolver(target);
	}
	const userName = mw?.config?.get?.('wgUserName') || '';
	return `User:${userName}/${target}.js`;
}

function removeRangesFromLines(lines, ranges) {
	if (!ranges.length) {
		return lines.slice();
	}
	const removeIndexes = new Set();
	ranges.forEach(({ start, end }) => {
		for (let index = start; index <= end; index++) {
			removeIndexes.add(index);
		}
	});
	return lines.filter((_, index) => !removeIndexes.has(index));
}

function appendWrapperToLines(lines, items) {
	const nextLines = lines.slice();
	while (nextLines.length && !nextLines[nextLines.length - 1].trim()) {
		nextLines.pop();
	}
	if (!items.length) {
		return nextLines;
	}
	if (nextLines.length) {
		nextLines.push('');
	}
	nextLines.push(...renderCaptureWrapperLines(items));
	return nextLines;
}

async function saveCaptureState(anImport, summaryKey, nextText) {
	const target = anImport.target || 'common';
	const api = getApiForTarget(target);
	if (!api) {
		throw new Error(`API is unavailable for target "${target}"`);
	}
	const title = getTargetTitle(anImport, target);
	await api.postWithEditToken({
		action: 'edit',
		title,
		text: nextText,
		summary: getSummaryForTarget(target, summaryKey, anImport.getDescription(true), getStrings()),
		formatversion: 2
	});
}

function isSameCaptureItem(item, key, normalizedLoadCall) {
	if (item.key && item.key === key) {
		return true;
	}
	return normalizeLoadCall(item.loadCall) === normalizedLoadCall;
}

export async function decaptureImport(anImport) {
	const target = anImport.target || 'common';
	const api = getApiForTarget(target);
	if (!api) {
		throw new Error(`API is unavailable for target "${target}"`);
	}
	const title = getTargetTitle(anImport, target);
	const current = await getWikitext(api, title);
	const lines = String(current || '').split('\n');
	const blocks = findCaptureBlocks(lines);
	if (!blocks.length) {
		throw new Error('Capture wrapper not found in target page');
	}

	const targetKey = anImport.getKey();
	const targetLoadCall = normalizeLoadCall(buildCapturedLoadCall(anImport));
	const captureItems = parseCaptureItems(lines, blocks);
	const remainingItems = captureItems.filter((item) => !isSameCaptureItem(item, targetKey, targetLoadCall));
	if (remainingItems.length === captureItems.length) {
		throw new Error('Selected script is not captured');
	}

	const baseLines = removeRangesFromLines(lines, blocks);
	const plainImportLine = anImport.toJs(mw?.config?.get?.('wgServerName') || '');
	const hasEquivalentLoad = baseLines.some((line) => {
		return normalizeLoadCall(extractLoadCall(line)) === targetLoadCall;
	});
	if (!hasEquivalentLoad) {
		baseLines.push(plainImportLine);
	}
	const nextLines = appendWrapperToLines(baseLines, remainingItems);
	const nextText = nextLines.join('\n');
	if (nextText === current) {
		return false;
	}

	await saveCaptureState(anImport, 'summary-decapture', nextText);
	showNotification('notification-decapture-success', 'success', anImport.getDisplayName());
	return true;
}

async function captureImport(anImport, captureName) {
	const target = anImport.target || 'common';
	const api = getApiForTarget(target);
	if (!api) {
		throw new Error(`API is unavailable for target "${target}"`);
	}

	const title = getTargetTitle(anImport, target);
	if (!title) {
		throw new Error(`Target title is unavailable for target "${target}"`);
	}

	const current = await getWikitext(api, title);
	const lines = String(current || '').split('\n');
	const blocks = findCaptureBlocks(lines);
	const existingItems = parseCaptureItems(lines, blocks);
	const lineNums = anImport.getLineNums(current);
	if (!lineNums.length) {
		throw new Error('Import line not found in target page');
	}

	const selectedRange = {
		start: Math.min(...lineNums),
		end: Math.max(...lineNums)
	};
	const selectedKey = anImport.getKey();
	const selectedLoadCall = normalizeLoadCall(buildCapturedLoadCall(anImport));
	const filteredItems = existingItems.filter((item) => !isSameCaptureItem(item, selectedKey, selectedLoadCall));
	const nextItems = dedupeCaptureItems([ ...filteredItems, buildCaptureItem(anImport, captureName) ]);
	const baseLines = removeRangesFromLines(lines, [ ...blocks, selectedRange ]);
	const nextLines = appendWrapperToLines(baseLines, nextItems);
	const nextText = nextLines.join('\n');

	if (nextText === current) {
		return false;
	}

	await saveCaptureState(anImport, 'summary-capture', nextText);

	return true;
}

export function showCaptureDialog(anImport, onDone) {
	const existing = document.getElementById('sm-capture-dialog');
	if (existing && existing.parentNode) {
		existing.parentNode.removeChild(existing);
	}

	const container = $('<div>').attr('id', 'sm-capture-dialog');
	$('body').append(container);

	void loadVueCodex()
		.then((libs) =>
			createCaptureDialog(
				container,
				libs.createApp,
				libs.defineComponent,
				libs.ref,
				libs.CdxDialog,
				libs.CdxButton,
				libs.CdxTextInput,
				libs.CdxField,
				anImport,
				onDone
			)
		)
		.catch((error) => {
			logger.error('Failed to open capture dialog', error);
			container.remove();
			showNotification('notification-capture-error', 'error', anImport.getDisplayName());
		});
}

export function createCaptureDialog(
	container,
	createApp,
	defineComponent,
	ref,
	CdxDialog,
	CdxButton,
	CdxTextInput,
	CdxField,
	anImport,
	onDone
) {
	let app = null;

	const CaptureDialog = defineComponent({
		components: { CdxDialog, CdxButton, CdxTextInput, CdxField },
		setup() {
			const dialogOpen = ref(true);
			const isSaving = ref(false);
			const captureName = ref((anImport.getDisplayName() || '').replace(/_/g, ' '));

			const closeDialog = () => {
				dialogOpen.value = false;
				safeUnmount(app, container[0]);
			};

			const handleCapture = async () => {
				if (isSaving.value) {
					return;
				}
				isSaving.value = true;
				try {
					const normalizedName = String(captureName.value || '').trim() || anImport.getDisplayName();
					await captureImport(anImport, normalizedName);
					showNotification('notification-capture-success', 'success', anImport.getDisplayName());
					if (typeof onDone === 'function') {
						onDone({
							captureName: normalizedName
						});
					}
					closeDialog();
				} catch (error) {
					logger.error('Capture failed', error);
					showNotification('notification-capture-error', 'error', anImport.getDisplayName());
				} finally {
					isSaving.value = false;
				}
			};

			return {
				dialogOpen,
				isSaving,
				captureName,
				handleCapture,
				closeDialog,
				SM_t: t
			};
		},
		template: `
			<cdx-dialog
				class="sm-capture-dialog"
				v-model:open="dialogOpen"
				:title="SM_t('dialog-capture-title')"
				:use-close-button="true"
				@close="closeDialog"
			>
				<div class="sm-capture-content">
					<cdx-field>
						<template #label><span v-text="SM_t('dialog-capture-name')"></span></template>
						<template #description><span v-text="SM_t('dialog-capture-name-description')"></span></template>
						<cdx-text-input
							v-model="captureName"
							:disabled="isSaving"
						/>
					</cdx-field>
					<div class="sm-capture-actions">
						<cdx-button
							weight="quiet"
							:disabled="isSaving"
							@click="closeDialog"
						>
							<span v-text="SM_t('action-cancel')"></span>
						</cdx-button>
						<cdx-button
							action="progressive"
							weight="primary"
							:disabled="isSaving"
							@click="handleCapture"
						>
							<span v-text="isSaving ? SM_t('action-capture-progress') : SM_t('dialog-capture-button')"></span>
						</cdx-button>
					</div>
				</div>
			</cdx-dialog>
		`
	});

	try {
		app = createApp(CaptureDialog);
		if (app?.config?.compilerOptions) {
			app.config.compilerOptions.delimiters = [ '[%', '%]' ];
		}
		app.component('CdxDialog', CdxDialog);
		app.component('CdxButton', CdxButton);
		app.component('CdxTextInput', CdxTextInput);
		app.component('CdxField', CdxField);
		app.mount(container[0] || container);
		return app;
	} catch (error) {
		logger.error('CaptureDialog mount error', error);
		container.remove();
		return null;
	}
}
