/**
 * Script Manager
 * Based on [[en:User:Equazcion/ScriptInstaller]]
 * Adapted version of [[en:User:Enterprisey/script-installer]]
 * Refactoring and upgrade [[mw:User:Iniquity]]
 * Authors: Equazcion, Enterprisey, Iniquity
 * Licenses: (MIT OR CC-BY-SA-4.0)
 * Documentation: https://www.mediawiki.org/wiki/Script_Manager
 */

;(function() {
	const NS = mw.config.get('wgNamespaceNumber');
	const jsPage = (function() {
		try {
			const pn = mw.config.get('wgPageName') || '';
			const cm = mw.config.get('wgPageContentModel') || '';
			return /\.js$/i.test(pn) || /\.css$/i.test(pn) || /javascript|css|sanitized-css/i.test(cm);
		} catch {
			return true;
		}
	})();
	const CORE_JS =
		'//www.mediawiki.org/w/index.php?title=User:Iniquity/scriptManager-core.js&action=raw&ctype=text/javascript';
	const USER_LANG = mw.config.get('wgUserLanguage') || 'en';
	const SIDEBAR_I18N_CACHE_KEY_PREFIX = 'SM_sidebar_i18n';
	const SIDEBAR_I18N_LEGACY_CACHE_KEY = 'SM_sidebar_i18n';
	const SIDEBAR_I18N_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
	const SIDEBAR_I18N_URL_BASE = 'https://gitlab-content.toolforge.org/iniquity/script-manager/-/raw/main/i18n/';
	const DEFAULT_SIDEBAR_MESSAGES = {
		label: 'Script Manager',
		title: 'Script Manager',
		capturedScriptsHeading: 'Captured scripts'
	};
	let corePromise = null;

	function normalizeSidebarMessages(json) {
		try {
			const label = json && (json['sidebar-link'] || json['tooltip-manage-user-scripts']);
			if (!label) return null;
			const title = json['sidebar-link-title'] || label;
			return {
				label,
				title,
				capturedScriptsHeading: json['sidebar-captured-heading'] || DEFAULT_SIDEBAR_MESSAGES.capturedScriptsHeading
			};
		} catch {
			return null;
		}
	}

	function getEffectiveSidebarLanguage() {
		try {
			const params = new URLSearchParams(window.location.search || '');
			const override = params.get('uselang');
			if (override) return override;
		} catch {}
		try {
			const dynamicLang = mw.config.get('wgUserLanguage');
			if (dynamicLang) return dynamicLang;
		} catch {}
		return USER_LANG || 'en';
	}

	function buildSidebarCacheKey(lang) {
		return SIDEBAR_I18N_CACHE_KEY_PREFIX + ':' + lang;
	}

	function readCacheByKey(cacheKey, lang) {
		try {
			const raw = localStorage.getItem(cacheKey);
			if (!raw) return null;
			const cached = JSON.parse(raw);
			if (!cached || !cached.data || typeof cached.ts !== 'number') return null;
			if (Date.now() - cached.ts > SIDEBAR_I18N_CACHE_TTL) return null;
			if (cached.lang && cached.lang !== lang) return null;
			if (!cached.data.label || !cached.data.title) return null;
			return cached.data;
		} catch {
			return null;
		}
	}

	function readSidebarMessagesCache(lang) {
		const cacheKey = buildSidebarCacheKey(lang);
		return readCacheByKey(cacheKey, lang) || readCacheByKey(SIDEBAR_I18N_LEGACY_CACHE_KEY, lang);
	}

	function writeSidebarMessagesCache(lang, data) {
		try {
			const payload = JSON.stringify({
				lang,
				ts: Date.now(),
				data
			});
			const langKey = buildSidebarCacheKey(lang);
			localStorage.setItem(langKey, payload);
			// Backward compatibility for older helper scripts reading the legacy key.
			localStorage.setItem(
				SIDEBAR_I18N_LEGACY_CACHE_KEY,
				payload
			);
		} catch {}
	}

	function fetchSidebarMessages(requestedLang, callback) {
		try {
			const langs = [];
			if (requestedLang) {
				langs.push(requestedLang);
				const base = requestedLang.split('-')[0];
				if (base && base !== requestedLang) langs.push(base);
			}
			if (langs.indexOf('en') === -1) langs.push('en');
			let idx = 0;

			function done(messages) {
				if (callback) callback(messages || DEFAULT_SIDEBAR_MESSAGES);
			}

			function tryNext() {
				if (idx >= langs.length) {
					done(DEFAULT_SIDEBAR_MESSAGES);
					return;
				}
				const candidateLang = langs[idx++];
				const url = SIDEBAR_I18N_URL_BASE + encodeURIComponent(candidateLang) + '.json?mime=application/json';
				fetch(url)
					.then(function(r) {
						if (!r.ok) throw new Error('HTTP ' + r.status);
						return r.json();
					})
					.then(function(json) {
						const messages = normalizeSidebarMessages(json);
						if (messages) {
							writeSidebarMessagesCache(requestedLang, messages);
							done(messages);
							return;
						}
						tryNext();
					})
					.catch(function() {
						tryNext();
					});
			}

			tryNext();
		} catch {
			if (callback) callback(DEFAULT_SIDEBAR_MESSAGES);
		}
	}

	// Lightweight i18n loader: cache first, fetch on cache miss
	function loadSidebarMessages(callback) {
		const lang = getEffectiveSidebarLanguage();
		const cached = readSidebarMessagesCache(lang);
		if (cached) {
			if (callback) callback(cached, lang);
			return;
		}
		fetchSidebarMessages(lang, function(messages) {
			if (callback) callback(messages, lang);
		});
	}

	function shouldAutoload() {
		if (NS <= 0) return false;
		if (jsPage) return true;
		if (document.getElementsByClassName('scriptInstallerLink').length) return true;
		if (document.querySelector('table.infobox-user-script')) return true;
		return false;
	}

	function loadCoreScript() {
		return new Promise(function(resolve, reject) {
			try {
				if (mw.loader && typeof mw.loader.getScript === 'function') {
					mw.loader.getScript(CORE_JS).then(resolve, reject);
					return;
				}
			} catch {}

			const s = document.createElement('script');
			s.src = CORE_JS;
			s.async = true;
			s.onload = resolve;
			s.onerror = function(err) {
				reject(err || new Error('Failed to load core script'));
			};
			document.head.appendChild(s);
		});
	}

	function ensureCoreLoaded() {
		if (!corePromise) {
			corePromise = loadCoreScript().catch(function(err) {
				corePromise = null;
				throw err;
			});
		}
		return corePromise;
	}

	function openCoreUi() {
		try {
			if (mw && mw.hook) {
				mw.hook('scriptManager.open').fire();
				return;
			}
		} catch {}
		try {
			document.dispatchEvent(new Event('sm:open'));
		} catch {}
	}

	function addSidebarLink() {
		try {
			if (!mw || !mw.util || typeof mw.util.addPortletLink !== 'function') return;
			const portletId = 'p-tb'; // toolbox
			const linkId = 'n-script-manager';
			let link = document.getElementById(linkId);
			let appliedLang = null;
			function createOrUpdate(label, title) {
				if (!link) {
					link = mw.util.addPortletLink(portletId, '#', label, linkId, title);
					if (!link) return;
					link.addEventListener('click', function(e) {
						e.preventDefault();
						// SUMMARY_TAG is now handled internally by the core
						ensureCoreLoaded().then(openCoreUi).catch(function() {});
					});
				} else {
					try {
						link.textContent = label;
						link.setAttribute('title', title);
					} catch {}
				}
				// Move to second position in the toolbox
				const li = link.closest && link.closest('li') ? link.closest('li') : link.parentNode;
				const ul = li && li.parentNode;
				if (ul && li && ul.firstElementChild !== li) {
					const firstChild = ul.firstElementChild;
					const secondChild = firstChild && firstChild.nextElementSibling;
					ul.insertBefore(li, secondChild || null);
				}
			}
			function refreshSidebarLabel(force) {
				const currentLang = getEffectiveSidebarLanguage();
				if (!force && appliedLang === currentLang) return;
				loadSidebarMessages(function(msgs, resolvedLang) {
					if (msgs && msgs.label) {
						createOrUpdate(msgs.label, msgs.title || msgs.label);
						appliedLang = resolvedLang || currentLang;
					}
				});
			}
			// Create only after localized messages are available (avoid label jumping)
			refreshSidebarLabel(true);
			document.addEventListener('visibilitychange', function() {
				if (document.visibilityState === 'visible') {
					refreshSidebarLabel(false);
				}
			});
			window.addEventListener('languagechange', function() {
				refreshSidebarLabel(true);
			});
		} catch {}
	}

	function bootstrap() {
		addSidebarLink();
		if (shouldAutoload()) {
			// SUMMARY_TAG is now handled internally by the core
			ensureCoreLoaded().catch(function() {});
		}
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', bootstrap);
	} else {
		bootstrap();
	}
})();
