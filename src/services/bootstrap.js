import { DEFAULT_SKIN } from '@constants/skins';
import { initApis } from './api.js';
import { startCoreRuntime } from './coreRuntime.js';
import { loadGadgets, loadUserGadgetSettings } from './gadgets.js';
import { loadI18n } from './i18n.js';
import { ensureImportsForTarget } from './importList.js';
import { showNotification } from './notification.js';

export function createBootstrapService(context, readiness) {
	const logger = context.logger.child('bootstrap');

	return {
		async prepareRuntime() {
			await readiness.waitForBootstrap();
			initApis();
			logger.debug('Runtime prepared.');
		},
		async loadDomainData() {
			const userLang = context.runtime.mw?.config?.get('wgUserLanguage') || 'en';
			const importsReady = ensureImportsForTarget(DEFAULT_SKIN);
			const i18nReady = loadI18n(userLang);
			const gadgetsReady = Promise.all([ loadGadgets(), loadUserGadgetSettings() ]);
			await Promise.all([ importsReady, i18nReady, gadgetsReady ]);
			logger.info('Domain data loaded.');
		},
		async startCore() {
			await startCoreRuntime(context);
		},
		async run() {
			try {
				await this.prepareRuntime();
				await this.loadDomainData();
				await this.startCore();
			} catch (error) {
				logger.error('Bootstrap failed.', error);
				showNotification('Script Manager failed to initialize. Check console for details.', {
					type: 'error'
				});
				throw error;
			}
		}
	};
}
