import { MEDIAWIKI_CORE_MODULES } from '@constants/runtime';
import { toPromise } from '@utils/promise';

function waitForDomReady(doc) {
	if (!doc) {
		return Promise.resolve();
	}

	if (doc.readyState === 'interactive' || doc.readyState === 'complete') {
		return Promise.resolve();
	}

	return new Promise((resolve) => {
		doc.addEventListener('DOMContentLoaded', resolve, { once: true });
	});
}

async function waitForMediaWikiModules(context, modules) {
	const moduleLoader = context.runtime.mw?.loader;
	if (!moduleLoader || typeof moduleLoader.using !== 'function') {
		return;
	}

	await toPromise(moduleLoader.using(modules));
}

export function createReadinessFlow(context) {
	const logger = context.logger.child('readiness');

	return {
		async waitForDomReady() {
			await waitForDomReady(context.runtime.document);
		},
		async waitForCoreModules() {
			await waitForMediaWikiModules(context, MEDIAWIKI_CORE_MODULES);
		},
		async waitForBootstrap() {
			await this.waitForDomReady();
			await this.waitForCoreModules();
			logger.debug('Runtime prerequisites are ready.');
		}
	};
}
