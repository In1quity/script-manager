import { CORE_RUNTIME_GLOBAL_KEY } from '@constants/runtime';

let loadPromise = null;

function createRuntimePayload(context) {
	const serverName = context.getServerName();
	let currentScriptImport = null;
	try {
		const pageName = context.runtime.mw?.config?.get('wgPageName') || '';
		if (context.ImportClass && /\.js$/i.test(pageName)) {
			currentScriptImport = context.ImportClass.ofLocal(pageName, 'common');
		}
	} catch {
		currentScriptImport = null;
	}

	return {
		version: context.version,
		serverName,
		logger: context.logger.child('core'),
		Import: context.ImportClass,
		currentScriptImport,
		bootstrappedAt: new Date().toISOString()
	};
}

async function loadCoreModule() {
	if (!loadPromise) {
		loadPromise = import('../core/scriptManagerCoreRuntime.js');
	}
	await loadPromise;
}

export async function startCoreRuntime(context) {
	if (!context.runtime.window) {
		return;
	}

	context.runtime.window[CORE_RUNTIME_GLOBAL_KEY] = createRuntimePayload(context);
	context.logger.info('Loading core runtime adapter.');
	await loadCoreModule();
	context.logger.info('Core runtime loaded.');
}
