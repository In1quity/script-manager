import { DEFAULT_SKIN } from '@constants/skins';
import { initApis } from './api.js';
import { initCoreUi } from './coreRuntime.js';
import { loadGadgets, loadGadgetsLabel, loadSectionLabels, loadUserGadgetSettings } from './gadgets.js';
import { loadI18n, t } from './i18n.js';
import { ensureImportsForTarget } from './importList.js';
import { showNotification } from './notification.js';

/**
 * Effective UI language: URL uselang overrides user preference so the core matches what the user sees.
 * @param {import('./runtimeContext').ScriptManagerContext} context
 * @returns {string|undefined} Language code from uselang, or undefined to use wgUserLanguage.
 */
function getEffectiveUserLanguage(context) {
	try {
		const search = context.runtime.window?.location?.search;
		if (!search) return undefined;
		const params = new URLSearchParams(search);
		const uselang = params.get('uselang');
		return uselang && uselang.trim() ? uselang.trim() : undefined;
	} catch {
		return undefined;
	}
}

/** @param {string|undefined|null} code */
function normalizeLangCode(code) {
	if (code === undefined || code === null || typeof code !== 'string') return undefined;
	const trimmed = code.trim().toLowerCase();
	if (!trimmed) return undefined;
	return trimmed.split('-')[0] || undefined;
}

export function createBootstrapService(context, readiness) {
	const logger = context.logger.child('bootstrap');

	return {
		async prepareRuntime() {
			await readiness.waitForBootstrap();
			initApis();
			logger.debug('Runtime prepared.');
		},
		async loadDomainData() {
			const rawLang =
				getEffectiveUserLanguage(context) ||
				context.runtime.mw?.config?.get('wgUserLanguage') ||
				context.runtime.document?.documentElement?.getAttribute?.('lang');
			const userLang = normalizeLangCode(rawLang) || 'en';
			const siteLang = context.runtime.mw?.config?.get('wgContentLanguage') || 'en';
			const importsReady = ensureImportsForTarget(DEFAULT_SKIN);
			const i18nReady = loadI18n(userLang, { siteLanguage: siteLang });
			const gadgetsReady = loadGadgets()
				.then(() => Promise.all([ loadSectionLabels(), loadGadgetsLabel(), loadUserGadgetSettings() ]))
				.catch((error) => {
					logger.warn('Failed to preload gadgets data', error);
					return Promise.resolve();
				});
			await Promise.all([ importsReady, i18nReady, gadgetsReady ]);
			logger.info('Domain data loaded.');
		},
		async initCoreUi() {
			await initCoreUi(context);
		},
		async run() {
			try {
				await this.prepareRuntime();
				await this.loadDomainData();
				await this.initCoreUi();
			} catch (error) {
				logger.error('Bootstrap failed.', error);
				showNotification(t('error-bootstrap-failed'), 'error');
				throw error;
			}
		}
	};
}
