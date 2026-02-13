import { toPromise } from '@utils/promise';

export function createUiOrchestrator(options = {}) {
	const settings = {
		attachInstallLinks: options.attachInstallLinks || (() => {}),
		showUi: options.showUi || (() => {}),
		openPanel: options.openPanel || (() => {}),
		waitI18n: options.waitI18n || (() => Promise.resolve()),
		waitGadgetsLabel: options.waitGadgetsLabel || (() => Promise.resolve()),
		waitImportsReady: options.waitImportsReady || (() => Promise.resolve()),
		isJsRelatedPage: options.isJsRelatedPage !== false,
		onOpenHook: options.onOpenHook || (() => {}),
		onOpenEvent: options.onOpenEvent || (() => {})
	};

	async function waitForOpenReadiness() {
		await toPromise(settings.waitI18n());
		await toPromise(settings.waitGadgetsLabel());
		await toPromise(settings.waitImportsReady());
	}

	return {
		async bootstrap() {
			await toPromise(settings.attachInstallLinks());
			if (!settings.isJsRelatedPage) {
				return;
			}
			await waitForOpenReadiness();
			await toPromise(settings.showUi());
		},
		async open() {
			await waitForOpenReadiness();
			await toPromise(settings.openPanel());
		},
		registerOpenHandlers() {
			settings.onOpenHook(() => {
				void this.open();
			});
			settings.onOpenEvent(() => {
				void this.open();
			});
		}
	};
}
