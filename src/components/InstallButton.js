import { showInstallDialog } from '@components/InstallDialog';
import { Import } from '@services/imports';
import { ensureAllImports, getTargetsForScript, refreshImportsView } from '@services/importList';
import { t } from '@services/i18n';
import { showNotification } from '@services/notification';
import { uniques } from '@utils/array';
import { loadVueCodex } from '@utils/codex';
import { createLogger } from '@utils/logger';
import { runWithScriptLock } from '@utils/scriptLock';

const logger = createLogger('component.installButton');

function getInitialInstallLabel(scriptName) {
	try {
		return getTargetsForScript(scriptName).length ? t('action-uninstall') : t('action-install');
	} catch {
		return t('action-install');
	}
}

export function mountInstallButton(hostElement, scriptName, dialogMeta = null) {
	if (!hostElement || !scriptName) {
		return;
	}

	const computeLabel = () => getInitialInstallLabel(scriptName);
	const initialLabel = computeLabel();

	void loadVueCodex()
		.then((libs) => {
			const { defineComponent, ref, computed } = libs;
			const InstallButton = defineComponent({
				setup() {
					const label = ref(initialLabel);
					const busy = ref(false);
					const actionType = computed(() => (label.value === t('action-install') ? 'progressive' : 'destructive'));

					const onClick = () => {
						if (busy.value) {
							return;
						}
						busy.value = true;

						if (label.value === t('action-install')) {
							const adapter = {
								text: (text) => {
									label.value = String(text);
								},
								resetBusy: () => {
									busy.value = false;
								}
							};

							try {
								showInstallDialog(scriptName, adapter, dialogMeta);
							} catch (error) {
								logger.error('showInstallDialog failed', error);
								busy.value = false;
							}
							return;
						}

						label.value = t('action-uninstall-progress');
						const targets = uniques(getTargetsForScript(scriptName));
						runWithScriptLock(scriptName, async () => {
							await Promise.all(
								targets.map((target) => Promise.resolve(Import.ofLocal(scriptName, target).uninstall()))
							);
							await refreshImportsView();
						})
							.then(() => {
								label.value = t('action-install');
							})
							.catch((error) => {
								logger.error('Uninstall from button failed', error);
								showNotification('notification-uninstall-error', 'error', scriptName);
								label.value = t('action-uninstall');
							})
							.finally(() => {
								busy.value = false;
							});
					};

					return {
						label,
						busy,
						actionType,
						onClick
					};
				},
				template:
					'<CdxButton :action="actionType" weight="primary" :disabled="busy" @click="onClick"><span v-text="label"></span></CdxButton>'
			});
			const app = libs.createApp(InstallButton);

			if (app?.config?.compilerOptions) {
				app.config.compilerOptions.delimiters = [ '[%', '%]' ];
			}
			app.component('CdxButton', libs.CdxButton);
			const mounted = app.mount(hostElement);
			void ensureAllImports().finally(() => {
				try {
					mounted.label = computeLabel();
				} catch {
					// Ignore stale mount references.
				}
			});
		})
		.catch((error) => {
			logger.error('mountInstallButton failed', error);
		});
}

export function mountInstallButtonAfterImports(hostElement, scriptName, dialogMeta = null) {
	void ensureAllImports()
		.catch((error) => {
			logger.warn('ensureAllImports before mount failed', error);
		})
		.finally(() => {
			mountInstallButton(hostElement, scriptName, dialogMeta);
		});
}
