import { DEFAULT_SKIN, SKINS } from '@constants/skins';
import { getApi, getApiForTarget } from '@services/api';
import { Import } from '@services/imports';
import { createLogger } from '@utils/logger';

const logger = createLogger('importList');
const importsByTarget = Object.create(null);
const importsLoadedTargets = Object.create(null);
let importsRef = null;
let buildImportListPromise = null;

function getLocalUserNamespaceName() {
	try {
		return mw?.config?.get('wgFormattedNamespaces')?.[2] || 'User';
	} catch {
		return 'User';
	}
}

function getFullTarget(target = DEFAULT_SKIN) {
	const cleanTarget = target || DEFAULT_SKIN;
	const userName = mw?.config?.get('wgUserName') || '';
	if (cleanTarget === 'global') {
		return `User:${userName}/global.js`;
	}
	return `${getLocalUserNamespaceName()}:${userName}/${cleanTarget}.js`;
}

function extractWikitextFromResponse(response) {
	const fromFormatVersion2 = response?.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content;
	if (typeof fromFormatVersion2 === 'string') {
		return fromFormatVersion2;
	}

	const pagesObject = response?.query?.pages;
	if (!pagesObject || typeof pagesObject !== 'object') {
		return '';
	}
	const firstPage = Object.values(pagesObject)[0];
	return firstPage?.revisions?.[0]?.slots?.main?.['*'] || '';
}

function getTargetFromTitle(pageTitle) {
	const title = String(pageTitle || '').replace(/_/g, ' ');
	const slashIndex = title.lastIndexOf('/');
	if (slashIndex < 0) {
		return '';
	}
	return title
		.slice(slashIndex + 1)
		.replace(/\.js$/i, '')
		.trim();
}

function parseImportsFromWikitext(text, target) {
	return String(text || '')
		.split('\n')
		.map((line) => Import.fromJs(line, target))
		.filter(Boolean);
}

export async function getWikitextForTarget(target) {
	const title = getFullTarget(target);
	const api = getApiForTarget(target);
	const response = await api.get({
		action: 'query',
		prop: 'revisions',
		titles: title,
		rvprop: [ 'content' ],
		rvslots: 'main',
		formatversion: 2
	});
	return extractWikitextFromResponse(response) || null;
}

function extractTargetTextsFromPages(pages) {
	const out = Object.create(null);
	if (!pages || typeof pages !== 'object') {
		return out;
	}

	Object.values(pages).forEach((page) => {
		const target = getTargetFromTitle(page?.title || '');
		if (!target) {
			return;
		}
		const text = page?.revisions?.[0]?.slots?.main?.['*'];
		out[target] = typeof text === 'string' ? text : null;
	});

	return out;
}

export async function getAllTargetWikitexts() {
	const localApi = getApi();
	const globalApi = getApiForTarget('global');

	if (!localApi || !globalApi) {
		return Object.create(null);
	}

	const localTargets = SKINS.filter((skin) => skin !== 'global');
	const localTitles = localTargets.map((skin) => getFullTarget(skin)).join('|');
	const globalTitle = getFullTarget('global');

	try {
		const [ localData, globalData ] = await Promise.all([
			localApi.get({
				action: 'query',
				prop: 'revisions',
				rvprop: 'content',
				rvslots: 'main',
				titles: localTitles
			}),
			globalApi.get({
				action: 'query',
				prop: 'revisions',
				rvprop: 'content',
				rvslots: 'main',
				titles: globalTitle
			})
		]);

		const result = Object.create(null);
		Object.assign(result, extractTargetTextsFromPages(localData?.query?.pages));
		Object.assign(result, extractTargetTextsFromPages(globalData?.query?.pages));
		return result;
	} catch (error) {
		logger.warn('getAllTargetWikitexts fallback path', error);
		const fallbackData = await localApi.get({
			action: 'query',
			prop: 'revisions',
			rvprop: 'content',
			rvslots: 'main',
			titles: localTargets.map((skin) => getFullTarget(skin)).join('|')
		});
		return extractTargetTextsFromPages(fallbackData?.query?.pages);
	}
}

function syncImportsRef() {
	if (!importsRef || typeof importsRef !== 'object' || !('value' in importsRef)) {
		return;
	}
	try {
		importsRef.value = Object.assign({}, importsByTarget);
	} catch {
		// Ignore stale refs.
	}
}

export function getImportsRef() {
	return importsRef;
}

export function setImportsRef(refValue) {
	importsRef = refValue || null;
	syncImportsRef();
}

export async function buildImportList(targets) {
	if (buildImportListPromise) {
		return buildImportListPromise;
	}

	buildImportListPromise = (async () => {
		if (Array.isArray(targets) && targets.length > 0) {
			const results = await Promise.all(
				targets.map(async (target) => {
					const text = await getWikitextForTarget(target);
					return { target, text };
				})
			);

			results.forEach(({ target, text }) => {
				importsByTarget[target] = parseImportsFromWikitext(text, target);
				importsLoadedTargets[target] = true;
			});
			syncImportsRef();
			return importsByTarget;
		}

		const wikitexts = await getAllTargetWikitexts();
		const nextImports = Object.create(null);

		Object.keys(wikitexts).forEach((target) => {
			nextImports[target] = parseImportsFromWikitext(wikitexts[target], target);
			importsLoadedTargets[target] = true;
		});

		Object.keys(importsByTarget).forEach((key) => {
			delete importsByTarget[key];
		});
		Object.assign(importsByTarget, nextImports);
		syncImportsRef();
		return importsByTarget;
	})();

	try {
		return await buildImportListPromise;
	} finally {
		buildImportListPromise = null;
	}
}

export async function ensureImportsForTarget(target = DEFAULT_SKIN) {
	const cleanTarget = target || DEFAULT_SKIN;
	if (importsLoadedTargets[cleanTarget]) {
		return importsByTarget[cleanTarget] || [];
	}
	await buildImportList([ cleanTarget ]);
	return importsByTarget[cleanTarget] || [];
}

export async function ensureAllImports() {
	const missing = SKINS.filter((skin) => !importsLoadedTargets[skin]);
	if (missing.length) {
		await buildImportList(missing);
	}
	return importsByTarget;
}

export function getImportList() {
	return importsByTarget;
}

export function getTargetsForScript(scriptName) {
	const targetMap = Object.create(null);
	Object.keys(importsByTarget).forEach((target) => {
		(importsByTarget[target] || []).forEach((anImport) => {
			if (anImport?.page === scriptName) {
				targetMap[target] = true;
			}
		});
	});
	return Object.keys(targetMap);
}

export async function refreshImportsView() {
	await buildImportList();
	syncImportsRef();
}
