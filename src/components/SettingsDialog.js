import { SKINS } from '@constants/skins';
import { getGadgetsLabel } from '@services/gadgets';
import { t } from '@services/i18n';
import { showNotification } from '@services/notification';
import { loadSettings, saveSettings } from '@services/settings';
import { loadVueCodex } from '@utils/codex';
import { createLogger } from '@utils/logger';
import { safeUnmount } from '@utils/vue';

const logger = createLogger('component.settingsDialog');

function escapeHtml(value) {
	return String(value || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function encodeWikiPath(path) {
	return String(path || '')
		.split('/')
		.map((part) => encodeURIComponent(part))
		.join('/')
		.replace(/%3A/gi, ':')
		.replace(/%20/g, '_');
}

function resolveWikiLinkTarget(target) {
	const clean = String(target || '').trim().replace(/^:/, '');
	const interwikiMatch = /^([a-z-]+):(.*)$/.exec(clean);
	if (interwikiMatch) {
		const prefix = String(interwikiMatch[1] || '').toLowerCase();
		const title = encodeWikiPath(interwikiMatch[2] || '');
		if (prefix === 'en') {
			return `https://en.wikipedia.org/wiki/${title}`;
		}
		if (prefix === 'mw') {
			return `https://www.mediawiki.org/wiki/${title}`;
		}
		if (prefix === 'meta') {
			return `https://meta.wikimedia.org/wiki/${title}`;
		}
	}

	try {
		if (mw?.util?.getUrl) {
			return mw.util.getUrl(clean);
		}
	} catch {
		// Ignore if mw.util is unavailable.
	}

	return `/wiki/${encodeWikiPath(clean)}`;
}

function renderInlineWikitext(value) {
	const source = String(value || '');
	const linkRgx = /\[\[([^[\]|]+?)(?:\|([^[\]]+?))?\]\]/g;
	let lastIndex = 0;
	let result = '';
	let match;

	while ((match = linkRgx.exec(source)) !== null) {
		const [ full, target, label ] = match;
		const index = match.index;
		result += escapeHtml(source.slice(lastIndex, index));
		const href = resolveWikiLinkTarget(target);
		const text = label || target;
		result += `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(text)}</a>`;
		lastIndex = index + full.length;
	}

	result += escapeHtml(source.slice(lastIndex));
	return result;
}

function getDefaultTabLabel(value) {
	if (value === 'gadgets') {
		return getGadgetsLabel() || t('label-gadgets');
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
				libs.CdxCheckbox,
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
	CdxCheckbox,
	currentSettings,
	onSaved
) {
	let app = null;

	const SettingsDialog = defineComponent({
		components: { CdxDialog, CdxButton, CdxSelect, CdxField, CdxCheckbox },
		setup() {
			const dialogOpen = ref(true);
			const isSaving = ref(false);
			const defaultTab = ref(currentSettings?.defaultTab || 'common');
			const captureEnabled = ref(currentSettings?.captureEnabled === true);
			const userscriptLoadCachingEnabled = ref(currentSettings?.userscriptLoadCachingEnabled === true);
			const userscriptLoadCachingDescriptionHtml = ref(
				renderInlineWikitext(t('settings-userscript-load-caching-enabled-description'))
			);

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
					await saveSettings({
						...(currentSettings || {}),
						defaultTab: defaultTab.value,
						captureEnabled: captureEnabled.value,
						userscriptLoadCachingEnabled: userscriptLoadCachingEnabled.value
					});
					showNotification('settings-saved', 'success');
					if (typeof onSaved === 'function') {
						onSaved({
							defaultTab: defaultTab.value,
							captureEnabled: captureEnabled.value,
							userscriptLoadCachingEnabled: userscriptLoadCachingEnabled.value
						});
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
				captureEnabled,
				userscriptLoadCachingEnabled,
				userscriptLoadCachingDescriptionHtml,
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
					<cdx-field>
						<template #label><span v-text="SM_t('settings-capture-heading')"></span></template>
						<template #description><span v-text="SM_t('settings-capture-enabled-description')"></span></template>
						<cdx-checkbox
							v-model="captureEnabled"
							:disabled="isSaving"
						>
							<span v-text="SM_t('settings-capture-enabled')"></span>
						</cdx-checkbox>
					</cdx-field>
					<cdx-field>
						<template #label><span v-text="SM_t('settings-userscript-load-caching-heading')"></span></template>
						<template #description><span v-html="userscriptLoadCachingDescriptionHtml"></span></template>
						<cdx-checkbox
							v-model="userscriptLoadCachingEnabled"
							:disabled="isSaving"
						>
							<span v-text="SM_t('settings-userscript-load-caching-enabled')"></span>
						</cdx-checkbox>
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
		app.component('CdxCheckbox', CdxCheckbox);
		app.mount(container[0] || container);
		return app;
	} catch (error) {
		logger.error('SettingsDialog mount error', error);
		container.remove();
		return null;
	}
}
