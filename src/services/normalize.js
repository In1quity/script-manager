import { createLogger } from '@utils/logger';

const logger = createLogger('normalize');

export function normalizeImports(imports) {
	const list = Array.isArray(imports) ? imports.slice() : [];
	list.sort((a, b) => String(a?.page || '').localeCompare(String(b?.page || '')));
	return list;
}

export function reloadAfterChange() {
	try {
		window.location.reload();
	} catch (error) {
		logger.warn('reloadAfterChange failed', error);
	}
}
