import { SKINS } from '@constants/skins';
import { Import } from '@services/imports';
import { showNotification } from '@services/notification';
import { refreshImportsView } from '@services/importList';
import { reloadAfterChange } from '@services/normalize';
import { t } from '@services/i18n';
import { loadVueCodex } from '@utils/codex';
import { createLogger } from '@utils/logger';
import { getCurrentSourceWiki, normalizeSourceWiki } from '@utils/mediawiki';
import { getSkinLabel } from '@utils/skinLabels';
import { runWithScriptLock } from '@utils/scriptLock';
import { safeUnmount } from '@utils/vue';

const logger = createLogger('component.installDialog');

function setButtonText(buttonElement, text) {
	try {
		if (!buttonElement) {
			return;
		}
		if (typeof buttonElement.text === 'function') {
			buttonElement.text(text);
			return;
		}
		if (typeof buttonElement.textContent === 'string') {
			buttonElement.textContent = text;
		}
	} catch {
		// Ignore adapter update failures.
	}
}

function resetButtonBusy(buttonElement) {
	try {
		if (buttonElement && typeof buttonElement.resetBusy === 'function') {
			buttonElement.resetBusy();
		}
	} catch {
		// Ignore adapter reset errors.
	}
}

function resolveSourceWiki(dialogMeta) {
	const fromMeta = normalizeSourceWiki(dialogMeta?.sourceWiki);
	if (fromMeta) {
		return fromMeta;
	}
	return getCurrentSourceWiki();
}

function buildInstallConfirmText(scriptName, dialogMeta) {
	const sourceWiki = resolveSourceWiki(dialogMeta);
	const sourceLine = sourceWiki ? `${t('label-loaded-from').replace('$1', sourceWiki)}\n` : '';
	return `${scriptName}\n${sourceLine}\n${t('dialog-install-warning')}\n\n${t('dialog-install-question')}`;
}

export function showInstallDialog(scriptName, buttonElement, dialogMeta = null) {
	const container = $('<div>').attr('id', 'sm-install-dialog');
	$('body').append(container);

	const open = () => {
		let observer = null;
		try {
			observer = new MutationObserver(() => {
				if (document.getElementById('sm-install-dialog')) {
					return;
				}
				resetButtonBusy(buttonElement);
				observer?.disconnect();
			});
			observer.observe(document.body, { childList: true, subtree: true });
		} catch {
			observer = null;
		}

		void loadVueCodex()
			.then((libs) =>
				createInstallDialog(
					container,
					libs.createApp,
					libs.defineComponent,
					libs.ref,
					libs.CdxDialog,
					libs.CdxButton,
					libs.CdxMessage,
					libs.CdxSelect,
					libs.CdxField,
					scriptName,
					buttonElement,
					dialogMeta
				)
			)
			.catch((error) => {
				logger.error('Failed to open install dialog', error);
				const okay = window.confirm(buildInstallConfirmText(scriptName, dialogMeta));
				if (!okay) {
					resetButtonBusy(buttonElement);
					return;
				}
				setButtonText(buttonElement, t('action-install-progress'));
				void runWithScriptLock(scriptName, () => Promise.resolve(Import.ofLocal(scriptName, 'common').install()))
					.then(() => {
						setButtonText(buttonElement, t('action-uninstall'));
						return refreshImportsView();
					})
					.then(() => {
						reloadAfterChange();
					})
					.catch((installError) => {
						logger.error('Fallback install failed', installError);
						showNotification('notification-install-error', 'error', scriptName);
						setButtonText(buttonElement, t('action-install'));
						resetButtonBusy(buttonElement);
					});
			});
	};

	try {
		open();
	} catch (error) {
		logger.error('showInstallDialog failed', error);
		container.remove();
		resetButtonBusy(buttonElement);
	}
}

export function createInstallDialog(
	container,
	createApp,
	defineComponent,
	ref,
	CdxDialog,
	CdxButton,
	CdxMessage,
	CdxSelect,
	CdxField,
	scriptName,
	buttonElement,
	dialogMeta
) {
	let app = null;

	const InstallDialog = defineComponent({
		components: { CdxDialog, CdxButton, CdxMessage, CdxSelect, CdxField },
		setup() {
			const dialogOpen = ref(true);
			const selectedSkin = ref('common');
			const isInstalling = ref(false);
			const sourceWiki = ref(resolveSourceWiki(dialogMeta));
			const sourceText = ref(
				sourceWiki.value ? t('label-loaded-from').replace('$1', sourceWiki.value) : ''
			);
			const warningText = ref(t('dialog-install-warning'));
			const questionText = ref(t('dialog-install-question'));

			const skinOptions = SKINS.map((skin) => ({
				label: getSkinLabel(skin, true),
				value: skin
			}));

			const closeDialog = () => {
				dialogOpen.value = false;
				safeUnmount(app, container[0]);
				resetButtonBusy(buttonElement);
			};

			const handleInstall = async () => {
				if (isInstalling.value) {
					return;
				}
				isInstalling.value = true;
				setButtonText(buttonElement, t('action-install-progress'));
				try {
					await runWithScriptLock(scriptName, () =>
						Promise.resolve(Import.ofLocal(scriptName, selectedSkin.value).install())
					);
					setButtonText(buttonElement, t('action-uninstall'));
					closeDialog();
					await refreshImportsView();
					reloadAfterChange();
				} catch (error) {
					logger.error('Failed to install script', error);
					showNotification('notification-install-error', 'error', scriptName);
					setButtonText(buttonElement, t('action-install'));
					resetButtonBusy(buttonElement);
				} finally {
					isInstalling.value = false;
				}
			};

			return {
				dialogOpen,
				selectedSkin,
				isInstalling,
				skinOptions,
				handleInstall,
				closeDialog,
				scriptName,
				sourceText,
				warningText,
				questionText,
				SM_t: t
			};
		},
		template: `
			<cdx-dialog
				v-model:open="dialogOpen"
				class="sm-install-dialog"
				:title="SM_t('dialog-install-title')"
				:use-close-button="true"
				:default-action="{ label: SM_t('action-cancel') }"
				:primary-action="{ label: isInstalling ? SM_t('action-install-progress') : SM_t('action-install'), actionType: 'progressive', disabled: isInstalling }"
				@default="closeDialog"
				@close="closeDialog"
				@primary="handleInstall"
			>
				<p class="sm-install-script-name" v-text="scriptName"></p>
				<p v-if="sourceText" class="sm-install-source" v-text="sourceText"></p>
				<cdx-message class="sm-install-warning" type="error" :allow-user-dismiss="false" :inline="false">
					<span v-text="warningText"></span>
				</cdx-message>
				<p class="sm-install-question" v-text="questionText"></p>
				<cdx-field>
					<template #label><span v-text="SM_t('dialog-move-to-skin')"></span></template>
					<cdx-select
						v-model:selected="selectedSkin"
						:menu-items="skinOptions"
						:default-label="SM_t('dialog-move-select-target')"
					/>
				</cdx-field>
			</cdx-dialog>
		`
	});

	try {
		app = createApp(InstallDialog);
		if (app?.config?.compilerOptions) {
			app.config.compilerOptions.delimiters = [ '[%', '%]' ];
		}
		app.component('CdxDialog', CdxDialog);
		app.component('CdxButton', CdxButton);
		app.component('CdxMessage', CdxMessage);
		app.component('CdxSelect', CdxSelect);
		app.component('CdxField', CdxField);
		app.mount(container[0] || container);
		return app;
	} catch (error) {
		logger.error('InstallDialog mount error', error);
		container.remove();
		resetButtonBusy(buttonElement);
		return null;
	}
}
