import { SKINS } from '@constants/skins';
import { getGadgetsLabel } from '@services/gadgets';
import { t } from '@services/i18n';
import { showNotification } from '@services/notification';
import { loadSettings, setSetting } from '@services/settings';
import { loadVueCodex } from '@utils/codex';
import { createLogger } from '@utils/logger';

const logger = createLogger('component.settingsDialog');

function safeUnmount(app, root) {
	try {
		if (app && typeof app.unmount === 'function') {
			app.unmount();
		}
	} catch {
		// Ignore unmount race conditions.
	}
	try {
		if (root?.parentNode) {
			root.parentNode.removeChild(root);
		}
	} catch {
		// Ignore already removed roots.
	}
}

function getDefaultTabLabel(value) {
	if (value === 'gadgets') {
		return getGadgetsLabel() || 'Gadgets';
	}
	if (value === 'all') {
		return t('skin-all');
	}
	if (value === 'common') {
		return t('skin-common');
	}
	if (value === 'global') {
		return t('skin-global');
	}
	return value;
}

function getDefaultTabOptions() {
	const options = [
		{ label: getDefaultTabLabel('gadgets'), value: 'gadgets' },
		{ label: getDefaultTabLabel('all'), value: 'all' },
		{ label: getDefaultTabLabel('global'), value: 'global' },
		{ label: getDefaultTabLabel('common'), value: 'common' }
	];
	SKINS.filter((s) => s !== 'common' && s !== 'global').forEach((skin) => {
		options.push({ label: getDefaultTabLabel(skin), value: skin });
	});
	return options;
}

export function showSettingsDialog(onSaved) {
	const existing = document.getElementById('sm-settings-dialog');
	if (existing && existing.parentNode) {
		existing.parentNode.removeChild(existing);
	}

	const container = $('<div>').attr('id', 'sm-settings-dialog');
	$('body').append(container);

	void Promise.all([ loadVueCodex(), loadSettings() ])
		.then(([ libs, currentSettings ]) =>
			createSettingsDialog(
				container,
				libs.createApp,
				libs.defineComponent,
				libs.ref,
				libs.CdxDialog,
				libs.CdxButton,
				libs.CdxSelect,
				libs.CdxField,
				currentSettings,
				onSaved
			)
		)
		.catch((error) => {
			logger.error('Failed to open settings dialog', error);
			container.remove();
			showNotification('notification-general-error', 'error');
		});
}

export function createSettingsDialog(
	container,
	createApp,
	defineComponent,
	ref,
	CdxDialog,
	CdxButton,
	CdxSelect,
	CdxField,
	currentSettings,
	onSaved
) {
	let app = null;

	const SettingsDialog = defineComponent({
		components: { CdxDialog, CdxButton, CdxSelect, CdxField },
		setup() {
			const dialogOpen = ref(true);
			const isSaving = ref(false);
			const defaultTab = ref(currentSettings?.defaultTab || 'common');

			const targetOptions = getDefaultTabOptions();

			const closeDialog = () => {
				dialogOpen.value = false;
				safeUnmount(app, container[0]);
			};

			const handleSave = async () => {
				if (isSaving.value) {
					return;
				}
				isSaving.value = true;
				try {
					await setSetting('defaultTab', defaultTab.value);
					showNotification('settings-saved', 'success');
					if (typeof onSaved === 'function') {
						onSaved({ defaultTab: defaultTab.value });
					}
					closeDialog();
				} catch (error) {
					logger.error('Failed to save settings', error);
					showNotification('notification-general-error', 'error');
				} finally {
					isSaving.value = false;
				}
			};

			return {
				dialogOpen,
				isSaving,
				defaultTab,
				targetOptions,
				closeDialog,
				handleSave,
				SM_t: t
			};
		},
		template: `
			<cdx-dialog
				class="sm-settings-dialog"
				v-model:open="dialogOpen"
				:title="SM_t('settings-title')"
				:use-close-button="true"
				@close="closeDialog"
			>
				<div class="sm-settings-content">
					<cdx-field>
						<template #label><span v-text="SM_t('settings-default-tab')"></span></template>
						<template #description><span v-text="SM_t('settings-default-tab-description')"></span></template>
						<cdx-select
							v-model:selected="defaultTab"
							:menu-items="targetOptions"
							:disabled="isSaving"
						/>
					</cdx-field>
					<div class="sm-settings-actions">
						<cdx-button
							weight="quiet"
							:disabled="isSaving"
							@click="closeDialog"
						>
							<span v-text="SM_t('action-cancel')"></span>
						</cdx-button>
						<cdx-button
							action="progressive"
							weight="primary"
							:disabled="isSaving"
							@click="handleSave"
						>
							<span v-text="SM_t('settings-save')"></span>
						</cdx-button>
					</div>
				</div>
			</cdx-dialog>
		`
	});

	try {
		app = createApp(SettingsDialog);
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
		logger.error('SettingsDialog mount error', error);
		container.remove();
		return null;
	}
}
