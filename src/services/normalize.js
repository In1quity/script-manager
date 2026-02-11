import { createLogger } from '@utils/logger';
import { getApiForTarget } from '@services/api';
import { getStrings, t } from '@services/i18n';
import { getWikitextForTarget } from '@services/importList';
import { Import } from '@services/imports';
import { showNotification } from '@services/notification';
import { getSummaryForTarget } from '@services/summaryBuilder';
import { urlToInterwiki } from '@utils/interwiki';

const logger = createLogger('normalize');

export function normalizeImports(imports) {
	const list = Array.isArray(imports) ? imports.slice() : [];
	list.sort((a, b) => String(a?.page || '').localeCompare(String(b?.page || '')));
	return list;
}

export async function normalize(target) {
	try {
		const wikitext = String((await getWikitextForTarget(target)) || '');
		const lines = wikitext.split('\n');
		const nextLines = Array(lines.length);
		const importsToResolve = [];
		const importIndexes = [];

		for (let index = 0; index < lines.length; index++) {
			const anImport = Import.fromJs(lines[index], target);
			if (anImport) {
				importsToResolve.push(anImport);
				importIndexes.push(index);
				continue;
			}
			nextLines[index] = lines[index];
		}

		await Promise.allSettled(
			importsToResolve.map(async (anImport) => {
				const interwiki = await anImport.resolveDocumentationInterwiki();
				if (interwiki) {
					anImport.docInterwiki = urlToInterwiki(interwiki) || interwiki;
				}
			})
		);

		const serverName = mw?.config?.get('wgServerName') || '';
		for (let index = 0; index < importsToResolve.length; index++) {
			const lineIndex = importIndexes[index];
			nextLines[lineIndex] = importsToResolve[index].toJs(serverName);
		}

		const nextText = nextLines.join('\n');
		if (nextText === wikitext) {
			return false;
		}

		const summary = getSummaryForTarget(target, 'summary-normalize', '', getStrings());
		await getApiForTarget(target).postWithEditToken({
			action: 'edit',
			title: Import.getTargetTitle(target),
			summary,
			text: nextText,
			formatversion: 2
		});

		showNotification('notification-normalize-success', 'success');
		return true;
	} catch (error) {
		logger.error('normalize failed', error);
		showNotification(t('notification-normalize-error', 'Normalize failed'), 'error');
		return false;
	}
}

export function reloadAfterChange() {
	try {
		window.location.reload();
	} catch (error) {
		logger.warn('reloadAfterChange failed', error);
	}
}
