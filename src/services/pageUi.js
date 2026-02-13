import { collectInstallableLinks } from '@components/InstallLinks';
import { showInstallDialog } from '@components/InstallDialog';
import { mountInstallButton, mountInstallButtonAfterImports } from '@components/InstallButton';
import { createPanel } from '@components/ScriptManagerPanel';
import { SKINS } from '@constants/skins';
import { SM_MEDIAWIKI_NAMESPACE_NUMBER, SM_USER_NAMESPACE_NUMBER } from '@constants/config';
import { getImportList, getTargetsForScript, refreshImportsView } from '@services/importList';
import { Import } from '@services/imports';
import { reloadAfterChange } from '@services/normalize';
import { t } from '@services/i18n';
import { renderIconInto } from '@utils/icons';
import { createLogger } from '@utils/logger';

const logger = createLogger('pageUi');

function uniques(array) {
	return array.filter((item, index) => index === array.indexOf(item));
}

function getUserNamespaceName() {
	try {
		return mw?.config?.get('wgFormattedNamespaces')?.[2] || 'User';
	} catch {
		return 'User';
	}
}

export function makeLocalInstallClickHandler(scriptName) {
	return function localInstallClickHandler() {
		const $self = $(this);
		const installText = t('action-install');
		const uninstallText = t('action-uninstall');

		if ($self.text() === installText) {
			const adapter = {
				text(text) {
					$self.text(text);
				},
				resetBusy() {
					$self.text(installText);
				}
			};
			showInstallDialog(scriptName, adapter);
			return;
		}

		$self.text(t('action-uninstall-progress'));
		const targets = getTargetsForScript(scriptName);
		void Promise.all(uniques(targets).map((target) => Promise.resolve(Import.ofLocal(scriptName, target).uninstall())))
			.then(() => refreshImportsView())
			.then(() => {
				$self.text(installText);
				reloadAfterChange();
			})
			.catch((error) => {
				logger.error('Local uninstall failed', error);
				$self.text(uninstallText);
			});
	};
}

export function buildCurrentPageInstallElement() {
	let addingInstallLink = false;
	const installElement = $('<span>');
	const namespaceNumber = mw.config.get('wgNamespaceNumber');
	const pageName = mw.config.get('wgPageName');
	const userNamespace = getUserNamespaceName();

	if (namespaceNumber === SM_USER_NAMESPACE_NUMBER && pageName.indexOf('/') > 0) {
		const contentModel = mw.config.get('wgPageContentModel');
		const isCodeModel = contentModel === 'javascript' || contentModel === 'css' || contentModel === 'sanitized-css';
		if (isCodeModel) {
			const prefix = `${userNamespace}:${mw.config.get('wgUserName')}`;
			if (pageName.indexOf(prefix) === 0) {
				const nameWithoutNs = pageName.substring(prefix.length + 1);
				const baseSkinName = nameWithoutNs.replace(/\.(?:js|css)$/i, '');
				if (SKINS.includes(baseSkinName)) {
					return $('<abbr>').text(t('error-cannot-install')).attr('title', t('error-cannot-install-skin'));
				}
			}
			addingInstallLink = true;
		} else {
			return $('<abbr>')
				.text(`${t('error-cannot-install')} (${t('error-not-javascript')})`)
				.attr(
					'title',
					t('error-cannot-install-content-model').replace('$1', String(contentModel || ''))
				);
		}
	}

	if (namespaceNumber === SM_MEDIAWIKI_NAMESPACE_NUMBER) {
		return $('<a>')
			.text(t('error-install-via-preferences'))
			.attr('href', `${mw.util.getUrl('Special:Preferences')}#mw-prefsection-gadgets`);
	}

	const editRestriction = mw.config.get('wgRestrictionEdit') || [];
	if (
		namespaceNumber !== SM_USER_NAMESPACE_NUMBER &&
		namespaceNumber !== SM_MEDIAWIKI_NAMESPACE_NUMBER &&
		(editRestriction.includes('sysop') || editRestriction.includes('editprotected'))
	) {
		installElement.append(
			' ',
			$('<abbr>')
				.append(
					$('<img>')
						.attr(
							'src',
							'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Achtung-yellow.svg/20px-Achtung-yellow.svg.png'
						)
						.addClass('warning'),
					t('error-insecure')
				)
				.attr('title', t('error-temp-warning'))
		);
		addingInstallLink = true;
	}

	if (!addingInstallLink) {
		return $('<abbr>')
			.text(`${t('error-cannot-install')} ${t('error-insecure')}`)
			.attr('title', t('error-bad-page'));
	}

	const fixedPageName = String(mw.config.get('wgPageName') || '').replace(/_/g, ' ');
	const installedTargets = getTargetsForScript(fixedPageName);
	installElement.prepend(
		$('<a>')
			.attr('id', 'script-installer-main-install')
			.text(installedTargets.length ? t('action-uninstall') : t('action-install'))
			.click(makeLocalInstallClickHandler(fixedPageName))
	);

	const firstTarget = installedTargets[0];
	const allScriptsInTarget = firstTarget ? getImportList()?.[firstTarget] || [] : [];
	const importObj = allScriptsInTarget.find((anImport) => anImport.page === fixedPageName);
	if (importObj?.disabled) {
		installElement.append(
			' | ',
			$('<a>')
				.attr('id', 'script-installer-main-enable')
				.text(t('action-enable'))
				.click(function onEnableClick() {
					$(this).text(t('action-enable-progress'));
					void Promise.resolve(importObj.setDisabled(false)).then(() => reloadAfterChange());
				})
		);
	}

	return installElement;
}

function injectInstallIndicator(fixedPageName) {
	try {
		const $indicatorRoot = $('#mw-indicators, .mw-indicators').first();
		if (!$indicatorRoot?.length) {
			return false;
		}

		const $installEl = buildCurrentPageInstallElement();
		const canInstall = $installEl?.find?.('#script-installer-main-install')?.length;
		if (!canInstall) {
			return false;
		}

		let $slot = $('#mw-indicator-sm-install');
		if (!$slot.length) {
			$slot = $('<div id="mw-indicator-sm-install" class="mw-indicator"></div>').appendTo($indicatorRoot);
		}
		$slot.empty();

		const host = $('<div id="sm-install-indicator-host"></div>');
		$slot.append(host);
		mountInstallButton(host[0], fixedPageName);
		return true;
	} catch (error) {
		logger.warn('Indicator injection failed', error);
		return false;
	}
}

function extractScriptNameFromSnippetText(text) {
	const lines = String(text || '')
		.split('\n')
		.map((line) => String(line || '').trim())
		.filter(Boolean);
	for (let index = 0; index < lines.length; index++) {
		const parsed = Import.fromJs(lines[index], 'common');
		if (parsed?.page) {
			return parsed.page;
		}
	}
	return null;
}

function getSnippetScriptName(node) {
	if (!node) {
		return null;
	}
	try {
		const direct = extractScriptNameFromSnippetText(node.textContent || '');
		if (direct) {
			return direct;
		}
	} catch {
		// Ignore broken snippet nodes.
	}
	return null;
}

export function showUi() {
	if (document.getElementById('sm-top-container')) {
		return;
	}

	const fixedPageName = String(mw.config.get('wgPageName') || '').replace(/_/g, ' ');
	try {
		document.getElementById('contentSub')?.classList?.add('sm-contentSub');
	} catch {
		// Ignore missing contentSub.
	}

	$('#firstHeading').append(
		$('<span>')
			.attr('id', 'sm-top-container')
			.append(
				(() => {
					const $button = $('<a>')
						.attr('id', 'sm-manage-button')
						.attr('title', t('tooltip-manage-user-scripts'))
						.addClass('sm-manage-button')
						.append($('<span class="sm-gear-icon"></span>'))
						.click(function onManageClick() {
							const panelExists = Boolean(document.getElementById('sm-panel'));
							if (!panelExists) {
								$('#mw-content-text').before(createPanel());
							} else {
								$('#sm-panel').remove();
							}
							try {
								$(this).toggleClass('open', !panelExists);
							} catch {
								// Ignore toggleClass failures in patched jQuery.
							}
						});

					(typeof requestAnimationFrame === 'function' ? requestAnimationFrame : setTimeout)(() => {
						try {
							const gear = document.querySelector('#sm-manage-button .sm-gear-icon');
							if (gear) {
								renderIconInto(gear, 'cdxIconSettings', 'currentColor', 16);
							}
						} catch (error) {
							logger.warn('Icon rendering failed', error);
						}
					}, 0);

					return $button;
				})()
			)
	);

	if (!injectInstallIndicator(fixedPageName)) {
		setTimeout(() => {
			injectInstallIndicator(fixedPageName);
		}, 100);
	}

	try {
		mw.hook('wikipage.content').add(() => {
			setTimeout(() => {
				injectInstallIndicator(fixedPageName);
				attachInstallLinks();
			}, 0);
		});
	} catch {
		// Ignore missing MediaWiki hook system.
	}
}

export function attachInstallLinks() {
	$(collectInstallableLinks(document)).each(function attachSimpleLink() {
		const scriptName = this.id;
		if ($(this).find('a').length) {
			return;
		}
		const installedTargets = getTargetsForScript(scriptName);
		$(this).append(
			' | ',
			$('<a>')
				.text(installedTargets.length ? t('action-uninstall') : t('action-install'))
				.click(makeLocalInstallClickHandler(scriptName))
		);
	});

	$('table.infobox-user-script').each(function attachInfoboxButtons() {
		if ($(this).find('.sm-ibx-host').length) {
			return;
		}

		const $table = $(this);
		let scriptName = null;

		try {
			const $data = $table.find('.userscript-install-data').first();
			const mainSource = $data.attr('data-mainsource') || $data.data('mainsource');
			if (mainSource) {
				const source = String(mainSource);
				let match;
				if ((match = /[?&]title=([^&#]+)/i.exec(source))) {
					scriptName = decodeURIComponent(match[1].replace(/\+/g, ' '));
				} else if ((match = /\/wiki\/([^?#]+)/i.exec(source))) {
					scriptName = decodeURIComponent(match[1]).replace(/_/g, ' ');
				} else if (/^User:/i.test(source)) {
					scriptName = source;
				}
			}
		} catch {
			scriptName = scriptName || null;
		}

		if (!scriptName) {
			try {
				const $link = $table
					.find("a[title*='User:']")
					.filter(function filterUserScriptLink() {
						const title = this.getAttribute('title') || '';
						return /user:\S+\/.+?\.js/i.test(title);
					})
					.first();
				if ($link.length) {
					scriptName = $link.attr('title');
				}
			} catch {
				scriptName = scriptName || null;
			}
		}

		if (!scriptName) {
			scriptName = mw.config.get('wgPageName');
		}

		try {
			const match = /user:.+?\/.+?\.js/i.exec(scriptName);
			if (match) {
				scriptName = match[0];
			}
		} catch {
			// Keep detected script name unchanged.
		}

		let $slot = $table.find('td.script-installer-ibx').last();
		if (!$slot.length) {
			let $tbody = $table.children('tbody');
			if (!$tbody.length) {
				$tbody = $table;
			}
			$slot = $tbody.append($('<tr>').append($('<td>').attr('colspan', '2').addClass('sm-ibx'))).find('td.sm-ibx');
		}

		const host = $('<div class="sm-ibx-host"></div>');
		$slot.append(host);
		mountInstallButtonAfterImports(host[0], scriptName);
	});

	$('#mw-content-text .mw-highlight pre, #mw-content-text pre').each(function attachSnippetButtons() {
		const scriptName = getSnippetScriptName(this);
		if (!scriptName) {
			return;
		}

		const container = this.closest('.mw-highlight') || this;
		const $container = $(container);
		if ($container.next('.sm-snippet-install-host').length) {
			return;
		}

		const host = $('<div class="sm-snippet-install-host"></div>');
		$container.after(host);
		mountInstallButtonAfterImports(host[0], scriptName);
	});
}
