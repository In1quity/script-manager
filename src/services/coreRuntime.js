import { createPanel } from '@components/ScriptManagerPanel';
import { createUiOrchestrator } from './uiOrchestrator.js';
import { attachInstallLinks, showUi } from './pageUi.js';

function isJsRelatedPage(context) {
	try {
		const pageName = context.runtime.mw?.config?.get('wgPageName') || '';
		const contentModel = context.runtime.mw?.config?.get('wgPageContentModel') || '';
		return /\.js$/i.test(pageName) || /\.css$/i.test(pageName) || /javascript|css|sanitized-css/i.test(contentModel);
	} catch {
		return true;
	}
}

function openPanel() {
	try {
		if (document.getElementById('sm-panel')) {
			return;
		}
		$('#mw-content-text').before(createPanel());
	} catch {
		// Ignore open failures from unsupported page layouts.
	}
}

export async function initCoreUi(context) {
	if (!context.runtime.window) {
		return;
	}

	const uiOrchestrator = createUiOrchestrator({
		attachInstallLinks,
		showUi,
		openPanel,
		waitI18n: () => Promise.resolve(),
		waitGadgetsLabel: () => Promise.resolve(),
		waitImportsReady: () => Promise.resolve(),
		isJsRelatedPage: isJsRelatedPage(context),
		onOpenHook(handler) {
			try {
				context.runtime.mw?.hook?.('scriptManager.open')?.add(handler);
			} catch {
				// Ignore missing hook integration.
			}
		},
		onOpenEvent(handler) {
			try {
				context.runtime.document?.addEventListener('sm:open', handler);
			} catch {
				// Ignore missing event target.
			}
		}
	});

	uiOrchestrator.registerOpenHandlers();
	await uiOrchestrator.bootstrap();
	context.state.uiOrchestrator = uiOrchestrator;
}

export async function startCoreRuntime(context) {
	return initCoreUi(context);
}
