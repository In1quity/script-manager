import { DEFAULT_SKIN, SKINS } from '@constants/skins';
import { getApiForTarget } from '@services/api';
import { Import } from '@services/imports';
import { extractWikitextFromResponse } from '@utils/wikitext';

const importsByTarget = {};

function parseImportsFromWikitext(text, target) {
	return String(text || '')
		.split('\n')
		.map((line) => Import.fromJs(line, target))
		.filter(Boolean);
}

async function fetchTargetWikitext(target) {
	const title = `User:${mw.config.get('wgUserName')}/${target}.js`;
	const api = getApiForTarget(target);
	const response = await api.get({
		action: 'query',
		prop: 'revisions',
		titles: title,
		rvprop: [ 'content' ],
		rvslots: 'main',
		formatversion: 2
	});
	return extractWikitextFromResponse(response);
}

export async function ensureImportsForTarget(target = DEFAULT_SKIN) {
	const cleanTarget = target || DEFAULT_SKIN;
	const wikitext = await fetchTargetWikitext(cleanTarget);
	importsByTarget[cleanTarget] = parseImportsFromWikitext(wikitext, cleanTarget);
	return importsByTarget[cleanTarget];
}

export async function ensureAllImports() {
	await Promise.all(SKINS.map((target) => ensureImportsForTarget(target)));
	return importsByTarget;
}

export function getImportList() {
	return importsByTarget;
}
