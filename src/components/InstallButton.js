import { showInstallDialog } from '@components/InstallDialog';
import { Import } from '@services/imports';
import { ensureAllImports, getTargetsForScript, refreshImportsView } from '@services/importList';
import { t } from '@services/i18n';
import { loadVueCodex } from '@utils/codex';
import { createLogger } from '@utils/logger';

const logger = createLogger('component.installButton');

function uniques(array) {
	return array.filter((item, index) => index === array.indexOf(item));
}

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
			const app = libs.createApp({
				data() {
					return {
						label: initialLabel,
						busy: false
					};
				},
				computed: {
					actionType() {
						return this.label === t('action-install') ? 'progressive' : 'destructive';
					}
				},
				methods: {
					onClick() {
						if (this.busy) {
							return;
						}
						this.busy = true;

						if (this.label === t('action-install')) {
							const adapter = {
								text: (text) => {
									this.label = String(text);
								},
								resetBusy: () => {
									this.busy = false;
								}
							};

							try {
								showInstallDialog(scriptName, adapter, dialogMeta);
							} catch (error) {
								logger.error('showInstallDialog failed', error);
								this.busy = false;
							}
							return;
						}

						this.label = t('action-uninstall-progress');
						const targets = uniques(getTargetsForScript(scriptName));
						Promise.all(
							targets.map((target) => Promise.resolve(Import.ofLocal(scriptName, target).uninstall()))
						)
							.then(() => refreshImportsView())
							.then(() => {
								this.label = t('action-install');
							})
							.catch((error) => {
								logger.error('Uninstall from button failed', error);
								this.label = t('action-uninstall');
							})
							.finally(() => {
								this.busy = false;
							});
					}
				},
				template:
					'<CdxButton :action="actionType" weight="primary" :disabled="busy" @click="onClick"><span v-text="label"></span></CdxButton>'
			});

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
