import { showMoveDialog } from '@components/MoveDialog';
import { DEFAULT_SKIN, SKINS } from '@constants/skins';
import {
	getEnabledGadgets,
	getGadgetsData,
	getGadgetsLabel,
	getGadgetSectionLabels,
	getGadgetSectionOrder,
	isEnabledGadgetsLoaded,
	getUserGadgetSettings,
	loadEnabledGadgets,
	loadGadgets,
	loadGadgetsLabel,
	loadSectionLabels,
	loadUserGadgetSettings,
	toggleGadget
} from '@services/gadgets';
import { t } from '@services/i18n';
import {
	ensureAllImports,
	ensureImportsForTarget,
	getImportList,
	refreshImportsView,
	setImportsRef
} from '@services/importList';
import { normalize, reloadAfterChange } from '@services/normalize';
import { showNotification } from '@services/notification';
import { loadVueCodex } from '@utils/codex';
import { createLogger } from '@utils/logger';
import { canonicalizeUserNamespace } from '@utils/namespace';

const logger = createLogger('component.scriptManagerPanel');

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

function getDefaultSkin() {
	try {
		if (typeof window.SM_DEFAULT_SKIN === 'string' && window.SM_DEFAULT_SKIN) {
			return window.SM_DEFAULT_SKIN;
		}
		if (typeof window.scriptInstallerInstallTarget === 'string' && window.scriptInstallerInstallTarget) {
			return window.scriptInstallerInstallTarget;
		}
	} catch {
		// Ignore runtime global read errors.
	}
	return DEFAULT_SKIN;
}

function toPromise(value) {
	if (value && typeof value.then === 'function') {
		return value;
	}
	return Promise.resolve(value);
}

export function createPanel() {
	const container = $('<div>').attr('id', 'sm-panel');
	void loadVueCodex()
		.then((libs) => {
			createVuePanel(
				container,
				libs.createApp,
				libs.defineComponent,
				libs.ref,
				libs.computed,
				libs.watch,
				libs.CdxDialog,
				libs.CdxButton,
				libs.CdxTextInput,
				libs.CdxSelect,
				libs.CdxField,
				libs.CdxTabs,
				libs.CdxTab,
				libs.CdxToggleButton
			);
		})
		.catch((error) => {
			logger.error('Failed to load Vue/Codex for panel', error);
			container.html('<div class="error">Failed to load interface. Please refresh the page.</div>');
		});
	return container;
}

export function createVuePanel(
	container,
	createApp,
	defineComponent,
	ref,
	computed,
	watch,
	CdxDialog,
	CdxButton,
	CdxTextInput,
	CdxSelect,
	CdxField,
	CdxTabs,
	CdxTab,
	CdxToggleButton
) {
	const rootEl = container[0];
	let app = null;

	const ScriptManager = defineComponent({
		components: { CdxDialog, CdxButton, CdxTextInput, CdxSelect, CdxField, CdxTabs, CdxTab, CdxToggleButton },
		setup() {
			const dialogOpen = ref(true);
			const filterText = ref('');
			const selectedSkin = ref(getDefaultSkin());
			const enabledOnly = ref(false);
			const loadingStates = ref({});
			const removedScripts = ref([]);
			const reloadOnClose = ref(false);
			const isNormalizing = ref(false);
			const normalizeCompleted = ref(false);
			const importsReactive = ref(Object.assign({}, getImportList()));
			const gadgetSectionLabels = ref(Object.assign({}, getGadgetSectionLabels() || {}));
			const gadgetsLabel = ref(getGadgetsLabel() || 'Gadgets');
			const gadgetsReactive = ref(Object.assign({}, getGadgetsData() || {}));
			const enabledGadgetsReactive = ref(Object.assign({}, getEnabledGadgets() || {}));
			const enabledGadgetsLoaded = ref(isEnabledGadgetsLoaded());
			const userGadgetSettingsReactive = ref(Object.assign({}, getUserGadgetSettings() || {}));
			setImportsRef(importsReactive);

			const setLoading = (key, value) => {
				loadingStates.value[key] = value;
			};

			const updateGadgetsState = () => {
				gadgetsReactive.value = Object.assign({}, getGadgetsData() || {});
				gadgetSectionLabels.value = Object.assign({}, getGadgetSectionLabels() || {});
				gadgetsLabel.value = getGadgetsLabel() || 'Gadgets';
				enabledGadgetsReactive.value = Object.assign({}, getEnabledGadgets() || {});
				enabledGadgetsLoaded.value = isEnabledGadgetsLoaded();
				userGadgetSettingsReactive.value = Object.assign({}, getUserGadgetSettings() || {});
			};

			const ensureGadgetsReady = async () => {
				await Promise.all([
					loadGadgets(),
					loadSectionLabels(),
					loadGadgetsLabel(),
					loadUserGadgetSettings(),
					loadEnabledGadgets()
				]);
				updateGadgetsState();
			};

			const isSelectedTargetLoaded = computed(() => {
				const tab = selectedSkin.value;
				if (tab === 'gadgets') {
					return true;
				}
				if (tab === 'all') {
					return Object.keys(importsReactive.value || {}).length > 0;
				}
				return Object.prototype.hasOwnProperty.call(importsReactive.value || {}, tab);
			});

			const filteredImports = computed(() => {
				const result = {};

				if (selectedSkin.value === 'gadgets') {
					const grouped = {};
					Object.keys(gadgetsReactive.value || {}).forEach((gadgetName) => {
						const gadget = gadgetsReactive.value[gadgetName];
						const section = gadget?.section || 'other';
						if (enabledOnly.value && !isGadgetEnabled(gadgetName)) {
							return;
						}
						if (!grouped[section]) {
							grouped[section] = {};
						}
						grouped[section][gadgetName] = gadget;
					});

					const orderedSections = (getGadgetSectionOrder() || []).filter((section) => grouped[section]);
					Object.keys(grouped).forEach((section) => {
						if (!orderedSections.includes(section)) {
							orderedSections.push(section);
						}
					});

					orderedSections.forEach((section) => {
						result[section] = {
							gadgets: grouped[section],
							label: section.charAt(0).toUpperCase() + section.slice(1)
						};
					});
					return result;
				}

				const orderedKeys = [ 'common', 'global' ];
				Object.keys(importsReactive.value || {})
					.filter((key) => key !== 'common' && key !== 'global')
					.sort()
					.forEach((key) => orderedKeys.push(key));

				orderedKeys.forEach((targetName) => {
					const list = importsReactive.value?.[targetName];
					if (!Array.isArray(list) || !list.length) {
						return;
					}
					if (selectedSkin.value !== 'all' && selectedSkin.value !== targetName) {
						return;
					}

					let targetImports = list.slice();
					if (enabledOnly.value) {
						targetImports = targetImports.filter((anImport) => !anImport.disabled);
					}
					if (filterText.value.trim()) {
						targetImports = targetImports.filter((anImport) =>
							`${(anImport.getDisplayName() || '').replace(/_/g, ' ')} ${anImport.getSourceLabel()}`
								.toLowerCase()
								.includes(filterText.value.toLowerCase())
						);
					}
					if (targetImports.length) {
						result[targetName] = targetImports;
					}
				});

				return result;
			});

			const skinTabs = computed(() => [
				{ name: 'gadgets', label: gadgetsLabel.value || 'Gadgets' },
				{ name: 'all', label: t('skin-all') },
				{ name: 'global', label: 'global' },
				{ name: 'common', label: 'common' },
				...SKINS.filter((skin) => skin !== 'common' && skin !== 'global').map((skin) => ({ name: skin, label: skin }))
			]);

			const onPanelClose = () => {
				dialogOpen.value = false;
			};

			if (watch) {
				watch(dialogOpen, (open) => {
					if (!open) {
						if (reloadOnClose.value) {
							reloadOnClose.value = false;
							(typeof requestAnimationFrame === 'function' ? requestAnimationFrame : setTimeout)(() => {
								reloadAfterChange();
							}, 0);
						}
						safeUnmount(app, rootEl);
					}
				});

				watch(
					selectedSkin,
					(newTab) => {
						if (!newTab) {
							return;
						}
						if (newTab === 'gadgets') {
							void ensureGadgetsReady().catch((error) => logger.warn('gadgets load failed', error));
						} else if (newTab === 'all') {
							void ensureAllImports().then(() => {
								importsReactive.value = Object.assign({}, getImportList());
							});
						} else {
							void ensureImportsForTarget(newTab).then(() => {
								importsReactive.value = Object.assign({}, getImportList());
							});
						}
					},
					{ immediate: true }
				);
			}

			const handleUninstall = (anImport) => {
				const importKey = anImport.getKey();
				const key = `uninstall-${importKey}`;
				setLoading(key, true);

				const isRemoved = removedScripts.value.includes(importKey);
				const action = isRemoved ? anImport.install() : anImport.uninstall();
				void toPromise(action)
					.then(() => {
						if (isRemoved) {
							const index = removedScripts.value.indexOf(importKey);
							if (index > -1) {
								removedScripts.value.splice(index, 1);
							}
						} else {
							removedScripts.value.push(importKey);
						}
						reloadOnClose.value = true;
						return refreshImportsView();
					})
					.then(() => {
						importsReactive.value = Object.assign({}, getImportList());
					})
					.catch((error) => {
						logger.error('uninstall/restore failed', error);
						showNotification(
							isRemoved ? 'notification-restore-error' : 'notification-uninstall-error',
							'error',
							anImport.getDisplayName()
						);
					})
					.finally(() => {
						setLoading(key, false);
					});
			};

			const handleToggleDisabled = (anImport) => {
				const key = `toggle-${anImport.getKey()}`;
				setLoading(key, true);
				void toPromise(anImport.toggleDisabled())
					.then(() => {
						reloadOnClose.value = true;
						return refreshImportsView();
					})
					.then(() => {
						importsReactive.value = Object.assign({}, getImportList());
					})
					.catch((error) => {
						logger.error('toggle disabled failed', error);
						showNotification('notification-general-error', 'error');
					})
					.finally(() => {
						setLoading(key, false);
					});
			};

			const handleMove = (anImport) => {
				showMoveDialog(anImport, () => {
					reloadOnClose.value = true;
					void refreshImportsView().then(() => {
						importsReactive.value = Object.assign({}, getImportList());
					});
				});
			};

			const handleNormalizeAll = () => {
				const targets = Object.keys(filteredImports.value).filter((targetName) => targetName !== 'gadgets');
				if (!targets.length || isNormalizing.value) {
					return;
				}
				isNormalizing.value = true;
				normalizeCompleted.value = false;

				Promise.all(targets.map((targetName) => normalize(targetName)))
					.then((results) => {
						if (results.some(Boolean)) {
							reloadOnClose.value = true;
						}
						normalizeCompleted.value = true;
					})
					.catch((error) => {
						logger.error('normalize all failed', error);
						showNotification('notification-normalize-error', 'error');
					})
					.finally(() => {
						isNormalizing.value = false;
					});
			};

			const handleGadgetToggle = (gadgetName, enabled) => {
				const key = `gadget-${gadgetName}`;
				setLoading(key, true);
				void toPromise(toggleGadget(gadgetName, enabled))
					.then(() => {
						enabledGadgetsReactive.value = Object.assign({}, getEnabledGadgets() || {});
						enabledGadgetsLoaded.value = isEnabledGadgetsLoaded();
						userGadgetSettingsReactive.value = Object.assign({}, getUserGadgetSettings() || {});
						showNotification(`Gadget ${gadgetName} ${enabled ? 'enabled' : 'disabled'}`, 'success');
						reloadOnClose.value = true;
					})
					.catch((error) => {
						logger.error('toggle gadget failed', error);
						showNotification('Failed to toggle gadget', 'error');
					})
					.finally(() => {
						setLoading(key, false);
					});
			};

			const isGadgetEnabled = (gadgetName) => {
				if (enabledGadgetsLoaded.value) {
					return Object.prototype.hasOwnProperty.call(enabledGadgetsReactive.value || {}, gadgetName);
				}

				const settings = userGadgetSettingsReactive.value || {};
				const key = `gadget-${gadgetName}`;
				if (Object.prototype.hasOwnProperty.call(settings, key)) {
					const value = settings[key];
					return value === '1' || value === '' || value === 1 || value === true;
				}
				const gadget = gadgetsReactive.value?.[gadgetName];
				return Boolean(gadget?.isDefault);
			};

			const getSkinUrl = (skinName) => {
				if (skinName === 'global') {
					return `https://meta.wikimedia.org/wiki/User:${mw.config.get('wgUserName')}/global.js`;
				}
				return `https://${mw.config.get('wgServerName')}/wiki/User:${mw.config.get('wgUserName')}/${skinName}.js`;
			};

			const getImportHumanUrl = (anImport) => {
				const page = canonicalizeUserNamespace(anImport.page);
				if (anImport.type === 0) {
					return `/wiki/${encodeURI(page)}`;
				}
				if (anImport.type === 1) {
					return `//${anImport.wiki}.org/wiki/${encodeURI(page)}`;
				}
				return anImport.url;
			};

			const getImportDisplayName = (anImport) => {
				return (anImport.getDisplayName() || '').replace(/_/g, ' ');
			};

			const getImportSourceLabel = (anImport) => {
				return anImport.getSourceLabel();
			};

			return {
				dialogOpen,
				filterText,
				selectedSkin,
				skinTabs,
				isSelectedTargetLoaded,
				filteredImports,
				loadingStates,
				removedScripts,
				gadgetSectionLabels,
				gadgetsLabel,
				enabledOnly,
				isNormalizing,
				normalizeCompleted,
				handleUninstall,
				handleToggleDisabled,
				handleMove,
				handleNormalizeAll,
				handleGadgetToggle,
				isGadgetEnabled,
				getSkinUrl,
				getImportHumanUrl,
				getImportDisplayName,
				getImportSourceLabel,
				SM_t: t,
				onPanelClose
			};
		},
		template: `
			<cdx-dialog
				class="sm-cdx-dialog"
				v-model:open="dialogOpen"
				:title="SM_t('script-name')"
				:use-close-button="true"
				@close="onPanelClose"
			>
				<div class="sm-subtitle" v-text="SM_t('panel-header')"></div>
				<div class="sm-controls">
					<div class="sm-search-wrap">
						<cdx-text-input
							v-model="filterText"
							:placeholder="SM_t('panel-quick-filter')"
							clearable
						/>
					</div>
					<div class="sm-skin-tabs-bar">
						<div class="sm-skin-tabs">
							<cdx-tabs v-model:active="selectedSkin">
								<cdx-tab v-for="tab in skinTabs" :key="tab.name" :name="tab.name" :label="tab.label"></cdx-tab>
							</cdx-tabs>
						</div>
						<div class="sm-enabled-toggle">
							<cdx-toggle-button v-model="enabledOnly" :aria-label="SM_t('panel-enabled-only')">
								<span v-text="SM_t('panel-enabled-only')"></span>
							</cdx-toggle-button>
						</div>
					</div>
				</div>

				<div class="sm-scroll">
					<div v-if="!isSelectedTargetLoaded" class="sm-tpl-loading">
						<div class="cdx-progress-indicator"><div class="cdx-progress-indicator__indicator"><progress class="cdx-progress-indicator__indicator__progress" aria-label="Loading"></progress></div></div>
					</div>
					<template v-else>
						<template v-if="selectedSkin === 'gadgets'">
							<div class="gadgets-section">
								<div v-if="Object.keys(filteredImports).length === 0" class="no-gadgets">
									<p v-text="SM_t('gadgets-not-available')"></p>
								</div>
								<div v-else class="gadgets-list">
									<div v-for="(sectionData, sectionName) in filteredImports" :key="sectionName" class="gadget-section">
										<h4 class="gadget-section-title" v-text="gadgetSectionLabels[sectionName] || sectionData.label"></h4>
										<div class="gadget-section-content">
											<div
												v-for="(gadget, gadgetName) in sectionData.gadgets"
												:key="gadgetName"
												class="gadget-item"
												:class="{ enabled: isGadgetEnabled(gadgetName) }"
											>
												<div class="gadget-info">
													<div class="gadget-name" v-text="gadgetName"></div>
													<div class="gadget-description" v-if="gadget.description" v-html="gadget.description"></div>
												</div>
												<div class="gadget-actions">
													<cdx-button
														weight="quiet"
														size="small"
														:disabled="loadingStates['gadget-' + gadgetName]"
														@click="handleGadgetToggle(gadgetName, !isGadgetEnabled(gadgetName))"
													>
														<span v-text="loadingStates['gadget-' + gadgetName] ? '...' : (isGadgetEnabled(gadgetName) ? SM_t('action-disable') : SM_t('action-enable'))"></span>
													</cdx-button>
												</div>
											</div>
										</div>
									</div>
								</div>
							</div>
						</template>
						<template v-else>
							<div v-for="(targetImports, targetName) in filteredImports" :key="targetName" class="script-target-section">
								<h3>
									<template v-if="targetName === 'common'">
										<a :href="getSkinUrl(targetName)" target="_blank" v-text="SM_t('skin-common')"></a>
									</template>
									<template v-else-if="targetName === 'global'">
										<a :href="getSkinUrl(targetName)" target="_blank" v-text="SM_t('skin-global')"></a>
									</template>
									<template v-else>
										<a :href="getSkinUrl(targetName)" target="_blank" v-text="targetName"></a>
									</template>
								</h3>
								<div class="script-list">
									<div
										v-for="anImport in targetImports"
										:key="anImport.getKey()"
										class="script-item"
										:class="{ disabled: anImport.disabled, 'script-item-removed': removedScripts.includes(anImport.getKey()) }"
									>
										<div class="script-info">
											<a :href="getImportHumanUrl(anImport)" class="script-link" v-text="getImportDisplayName(anImport)"></a>
											<span v-if="getImportSourceLabel(anImport)" class="script-source" v-text="getImportSourceLabel(anImport)"></span>
										</div>
										<div class="script-actions">
											<cdx-button
												weight="quiet"
												size="small"
												:disabled="loadingStates['toggle-' + anImport.getKey()]"
												@click="handleToggleDisabled(anImport)"
											>
												<span v-text="loadingStates['toggle-' + anImport.getKey()] ? '...' : (anImport.disabled ? SM_t('action-enable') : SM_t('action-disable'))"></span>
											</cdx-button>
											<cdx-button
												weight="quiet"
												size="small"
												:disabled="loadingStates['move-' + anImport.getKey()]"
												@click="handleMove(anImport)"
											>
												<span v-text="loadingStates['move-' + anImport.getKey()] ? '...' : SM_t('action-move')"></span>
											</cdx-button>
											<cdx-button
												action="destructive"
												weight="quiet"
												size="small"
												:disabled="loadingStates['uninstall-' + anImport.getKey()]"
												@click="handleUninstall(anImport)"
											>
												<span v-text="loadingStates['uninstall-' + anImport.getKey()] ? '...' : (removedScripts.includes(anImport.getKey()) ? SM_t('action-restore') : SM_t('action-uninstall'))"></span>
											</cdx-button>
										</div>
									</div>
								</div>
							</div>
						</template>
					</template>
				</div>

				<div class="sm-dialog-module">
					<div class="sm-bottom-left">
					</div>
					<div class="sm-dialog-actions">
						<cdx-button
							weight="primary"
							:disabled="Object.keys(filteredImports).length === 0 || selectedSkin === 'gadgets' || isNormalizing || normalizeCompleted"
							@click="handleNormalizeAll"
						>
							<span v-text="isNormalizing ? SM_t('action-normalize-progress') : (normalizeCompleted ? SM_t('action-normalize-completed') : SM_t('action-normalize'))"></span>
						</cdx-button>
					</div>
				</div>
			</cdx-dialog>
		`
	});

	try {
		app = createApp(ScriptManager);
		if (app?.config?.compilerOptions) {
			app.config.compilerOptions.delimiters = [ '[%', '%]' ];
		}
		app.mount(rootEl);
		return app;
	} catch (error) {
		logger.error('Error mounting panel', error);
		container.html(`<div class="error">Error creating Vue component: ${error.message}</div>`);
		return null;
	}
}
