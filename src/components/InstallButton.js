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
		return getTargetsForScript(scriptName).length ? t('action-uninstall', 'Uninstall') : t('action-install', 'Install');
	} catch {
		return t('action-install', 'Install');
	}
}

export function mountInstallButton(hostElement, scriptName) {
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
						return this.label === t('action-install', 'Install') ? 'progressive' : 'destructive';
					}
				},
				methods: {
					onClick() {
						if (this.busy) {
							return;
						}
						this.busy = true;

						if (this.label === t('action-install', 'Install')) {
							const adapter = {
								text: (text) => {
									this.label = String(text);
								},
								resetBusy: () => {
									this.busy = false;
								}
							};

							try {
								showInstallDialog(scriptName, adapter);
							} catch (error) {
								logger.error('showInstallDialog failed', error);
								this.busy = false;
							}
							return;
						}

						this.label = t('action-uninstall-progress', 'Uninstalling...');
						const targets = uniques(getTargetsForScript(scriptName));
						Promise.all(
							targets.map((target) => Promise.resolve(Import.ofLocal(scriptName, target).uninstall()))
						)
							.then(() => refreshImportsView())
							.then(() => {
								this.label = t('action-install', 'Install');
							})
							.catch((error) => {
								logger.error('Uninstall from button failed', error);
								this.label = t('action-uninstall', 'Uninstall');
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

export function mountInstallButtonAfterImports(hostElement, scriptName) {
	void ensureAllImports()
		.catch((error) => {
			logger.warn('ensureAllImports before mount failed', error);
		})
		.finally(() => {
			mountInstallButton(hostElement, scriptName);
		});
}
