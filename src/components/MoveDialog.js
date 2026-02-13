import { SKINS } from '@constants/skins';
import { refreshImportsView } from '@services/importList';
import { showNotification } from '@services/notification';
import { t } from '@services/i18n';
import { loadVueCodex } from '@utils/codex';
import { createLogger } from '@utils/logger';
import { getSkinLabel } from '@utils/skinLabels';
import { safeUnmount } from '@utils/vue';

const logger = createLogger('component.moveDialog');

export function showMoveDialog(anImport, onDone) {
	const container = $('<div>').attr('id', 'sm-move-dialog');
	$('body').append(container);

	void loadVueCodex()
		.then((libs) =>
			createMoveDialog(
				container,
				libs.createApp,
				libs.defineComponent,
				libs.ref,
				libs.CdxDialog,
				libs.CdxButton,
				libs.CdxSelect,
				libs.CdxField,
				anImport,
				onDone
			)
		)
		.catch((error) => {
			logger.error('Failed to load move dialog dependencies', error);
			const promptText = `${t('dialog-move-prompt')} ${SKINS.join(', ')}`;
			let destination = '';
			do {
				destination = String(window.prompt(promptText) || '').toLowerCase();
			} while (destination && !SKINS.includes(destination));

			if (!destination) {
				container.remove();
				return;
			}

			void Promise.resolve(anImport.move(destination))
				.then(() => refreshImportsView())
				.then(() => {
					if (typeof onDone === 'function') {
						onDone();
					}
				})
				.catch((moveError) => {
					logger.error('Fallback move failed', moveError);
					showNotification('notification-move-error', 'error', anImport.getDisplayName());
				})
				.finally(() => {
					container.remove();
				});
		});
}

export function createMoveDialog(
	container,
	createApp,
	defineComponent,
	ref,
	CdxDialog,
	CdxButton,
	CdxSelect,
	CdxField,
	anImport,
	onDone
) {
	let app = null;

	const MoveDialog = defineComponent({
		components: { CdxDialog, CdxButton, CdxSelect, CdxField },
		setup() {
			const dialogOpen = ref(true);
			const selectedTarget = ref('common');
			const isMoving = ref(false);

			const targetOptions = SKINS.filter((skin) => skin !== anImport.target).map((skin) => ({
				label: getSkinLabel(skin, true),
				value: skin
			}));

			const closeDialog = () => {
				dialogOpen.value = false;
				safeUnmount(app, container[0]);
			};

			const handleMove = async () => {
				if (isMoving.value) {
					return;
				}
				isMoving.value = true;
				try {
					await Promise.resolve(anImport.move(selectedTarget.value));
					await refreshImportsView();
					if (typeof onDone === 'function') {
						onDone();
					}
					closeDialog();
				} catch (error) {
					logger.error('Move failed', error);
					showNotification('notification-move-error', 'error', anImport.getDisplayName());
				} finally {
					isMoving.value = false;
				}
			};

			return {
				dialogOpen,
				selectedTarget,
				isMoving,
				targetOptions,
				getSkinLabel,
				handleMove,
				closeDialog,
				scriptName: (anImport.getDisplayName() || '').replace(/_/g, ' '),
				currentTarget: anImport.target,
				SM_t: t
			};
		},
		template: `
			<cdx-dialog
				v-model:open="dialogOpen"
				:title="SM_t('dialog-move-title')"
				:use-close-button="true"
				@close="closeDialog"
			>
				<div class="sm-move-content">
					<div class="sm-move-script-name" v-text="scriptName"></div>
					<div class="sm-move-current-location">
						<strong><span v-text="SM_t('dialog-move-current-location')"></span></strong>
						<div class="sm-move-current-location-value" v-text="currentTarget === 'global' || currentTarget === 'common' ? getSkinLabel(currentTarget, true) : currentTarget"></div>
					</div>
					<cdx-field>
						<template #label><span v-text="SM_t('dialog-move-to-skin')"></span></template>
						<cdx-select
							v-model:selected="selectedTarget"
							:menu-items="targetOptions"
							:disabled="isMoving"
							:default-label="SM_t('dialog-move-select-target')"
						/>
					</cdx-field>
					<div class="sm-move-actions">
						<cdx-button
							@click="handleMove"
							:disabled="isMoving"
							action="progressive"
						>
							<span v-text="isMoving ? SM_t('dialog-move-progress') : SM_t('dialog-move-button')"></span>
						</cdx-button>
					</div>
				</div>
			</cdx-dialog>
		`
	});

	try {
		app = createApp(MoveDialog);
		if (app?.config?.compilerOptions) {
			app.config.compilerOptions.delimiters = [ '[%', '%]' ];
		}
		app.component('CdxDialog', CdxDialog);
		app.component('CdxButton', CdxButton);
		app.component('CdxSelect', CdxSelect);
		app.component('CdxField', CdxField);
		app.mount(container[0] || container);
		return app;
	} catch (error) {
		logger.error('MoveDialog mount error', error);
		container.remove();
		return null;
	}
}
