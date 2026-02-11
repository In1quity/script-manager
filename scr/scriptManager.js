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

	// Lightweight i18n loader: fetch our JSON (user lang, then 'en'); create only when available
	function loadSidebarMessages(callback) {
		try {
			const langs = [];
			if (USER_LANG) {
				langs.push(USER_LANG);
				const base = USER_LANG.split('-')[0];
				if (base && base !== USER_LANG) langs.push(base);
			}
			if (langs.indexOf('en') === -1) langs.push('en');
			let idx = 0;
			function tryNext() {
				if (idx >= langs.length) {
					if (callback) callback({ label: 'Script Manager', title: 'Script Manager' });
					return;
				}
				const lang = langs[idx++];
				const url =
					'https://gitlab-content.toolforge.org/iniquity/script-manager/-/raw/main/i18n/' +
					encodeURIComponent(lang) +
					'.json?mime=application/json';
				fetch(url)
					.then(function(r) {
						if (!r.ok) throw new Error('HTTP ' + r.status);
						return r.json();
					})
					.then(function(json) {
						try {
							const label = json && (json['sidebar-link'] || json['tooltip-manage-user-scripts']);
							const title = json && (json['sidebar-link-title'] || label);
							const cap = json && json['sidebar-captured-heading'];
							if (label) {
								if (callback) callback({ label, title, capturedScriptsHeading: cap });
								return;
							}
						} catch {}
						tryNext();
					})
					.catch(function() {
						tryNext();
					});
			}
			tryNext();
		} catch {
			if (callback) callback({ label: 'Script Manager', title: 'Script Manager' });
		}
	}

	function shouldAutoload() {
		if (NS <= 0) return false;
		if (jsPage) return true;
		if (document.getElementsByClassName('scriptInstallerLink').length) return true;
		if (document.querySelector('table.infobox-user-script')) return true;
		return false;
	}

	function loadCssOnce() {
		// CSS is injected by scriptManager-core.js runtime.
	}

	function ensureCoreLoaded(callback) {
		loadCssOnce();
		if (window.__SM_CORE_READY) {
			if (callback) callback();
			return;
		}
		if (window.__SM_CORE_LOADING) {
			;(window.__SM_CORE_CBS || (window.__SM_CORE_CBS = [])).push(callback);
			return;
		}
		window.__SM_CORE_LOADING = true
		;(window.__SM_CORE_CBS || (window.__SM_CORE_CBS = [])).push(callback);
		function done() {
			window.__SM_CORE_LOADING = false;
			window.__SM_CORE_READY = true;
			try {
				;(window.__SM_CORE_CBS || []).splice(0).forEach(function(cb) {
					try {
						if (cb) cb();
					} catch {}
				});
			} catch {}
		}
		if (mw.loader && typeof mw.loader.getScript === 'function') {
			mw.loader.getScript(CORE_JS).then(done);
		} else {
			const s = document.createElement('script');
			s.src = CORE_JS;
			s.async = true;
			s.onload = done;
			document.head.appendChild(s);
		}
	}

	// --- Capture via hook: collect mw.loader.load/importScript calls and expose in sidebar ---
	;(function() {
		const ORIG = {
			mwLoad: null,
			getScript: null,
			importScript: null,
			importStylesheet: null,
			importStylesheetURI: null
		};
		function capLog() {
			try {
				console.log.apply(console, [ '[SM-cap]' ].concat([].slice.call(arguments)));
			} catch {}
		}
		function labelFromUrl(url) {
			try {
				const u = String(url || '');
				const qi = u.indexOf('?');
				if (qi !== -1) {
					const q = u.slice(qi + 1);
					const m = /(?:^|[?&])title=([^&#]+)/i.exec('?' + q);
					if (m && m[1]) {
						try {
							return decodeURIComponent(m[1].replace(/\+/g, ' '));
						} catch {
							return m[1];
						}
					}
				}
				const base = u.split('#')[0].split('?')[0];
				const parts = base.split('/');
				return parts[parts.length - 1] || u;
			} catch {
				return url;
			}
		}
		function isCss(spec, type) {
			try {
				if (type === 'text/css') return true;
			} catch {}
			try {
				const s = String(spec || '');
				if (/ctype=text\/css/i.test(s)) return true;
				if (/\.css(\?|$)/i.test(s)) return true;
			} catch {}
			return false;
		}
		function execCaptured(item) {
			try {
				if (!item) {
					capLog('exec: no item');
					return;
				}
				if (item.callType === 'mw.loader.load') {
					capLog('exec: mw.loader.load', item.args)
					;(ORIG.mwLoad || (mw && mw.loader && mw.loader.load)).apply(mw.loader, item.args || []);
					return;
				}
				if (item.callType === 'mw.loader.getScript') {
					capLog('exec: mw.loader.getScript', item.args)
					;(
						ORIG.getScript ||
						(mw && mw.loader && mw.loader.getScript) ||
						function() {
							return Promise.resolve();
						}
					).apply(mw.loader, item.args || []);
					return;
				}
				if (item.callType === 'importScript') {
					capLog('exec: importScript', item.args && item.args[0])
					;(ORIG.importScript || window.importScript)(item.args && item.args[0]);
					return;
				}
				if (item.callType === 'importStylesheet') {
					capLog('exec: importStylesheet', item.args && item.args[0])
					;(ORIG.importStylesheet || window.importStylesheet)(item.args && item.args[0]);
					return;
				}
				if (item.callType === 'importStylesheetURI') {
					capLog('exec: importStylesheetURI', item.args && item.args[0])
					;(ORIG.importStylesheetURI || window.importStylesheetURI)(item.args && item.args[0]);
					return;
				}
			} catch {}
		}
		function renderCaptured(items) {
			try {
				const tb = document.getElementById('p-tb');
				if (!tb) {
					capLog('render: #p-tb not found');
					return;
				}
				// Remove previous capture subsection if any
				try {
					const oldHeading = document.getElementById('smcap-heading');
					if (oldHeading) oldHeading.remove();
					const oldContent = document.getElementById('smcap-content');
					if (oldContent) oldContent.remove();
					const oldLis = tb.querySelectorAll('li[id^="n-smcap-"]');
					for (let i = 0; i < oldLis.length; i++) {
						oldLis[i].remove();
					}
				} catch {}
				if (!items || !items.length) {
					capLog('render: empty list');
					return;
				}

				// Build heading inside the same portlet
				const heading = document.createElement('div');
				heading.id = 'smcap-heading';
				heading.className = 'vector-menu-heading';
				heading.textContent = 'Captured scripts';
				try {
					loadSidebarMessages(function(msgs) {
						try {
							if (msgs && msgs.capturedScriptsHeading) heading.textContent = msgs.capturedScriptsHeading;
						} catch {}
					});
				} catch {}
				tb.appendChild(heading);

				// Build content list inside the same portlet
				const contentDiv = document.createElement('div');
				contentDiv.id = 'smcap-content';
				contentDiv.className = 'vector-menu-content';
				const ul = document.createElement('ul');
				ul.className = 'vector-menu-content-list';
				capLog('render: items =', items.length);
				items.forEach(function(it, idx) {
					const li = document.createElement('li');
					li.id = 'n-smcap-' + idx;
					li.className = 'mw-list-item mw-list-item-js';
					const a = document.createElement('a');
					a.href = '#';
					a.title = it.key || '';
					const span = document.createElement('span');
					span.textContent = it.label || it.key || 'item ' + (idx + 1);
					a.appendChild(span);
					a.addEventListener('click', function(ev) {
						ev.preventDefault();
						capLog('click:', it);
						execCaptured(it);
					});
					li.appendChild(a);
					ul.appendChild(li);
				});
				contentDiv.appendChild(ul);
				tb.appendChild(contentDiv);
			} catch {}
		}
		function dedupe(list) {
			const seen = {};
			const out = [];
			for (let i = 0; i < list.length; i++) {
				const it = list[i];
				const k = (it.callType || '') + '\u0001' + (it.key || '') + '\u0001' + (it.isCss ? 1 : 0);
				if (seen[k]) continue;
				seen[k] = true;
				out.push(it);
			}
			return out;
		}
		function captureLoads(runFn) {
			const captured = [];
			// save originals once
			try {
				if (!ORIG.mwLoad && mw && mw.loader) ORIG.mwLoad = mw.loader.load;
				if (!ORIG.getScript && mw && mw.loader) ORIG.getScript = mw.loader.getScript;
			} catch {}
			try {
				if (!ORIG.importScript && typeof window.importScript === 'function') ORIG.importScript = window.importScript;
			} catch {}
			try {
				if (!ORIG.importStylesheet && typeof window.importStylesheet === 'function')
					ORIG.importStylesheet = window.importStylesheet;
			} catch {}
			try {
				if (!ORIG.importStylesheetURI && typeof window.importStylesheetURI === 'function')
					ORIG.importStylesheetURI = window.importStylesheetURI;
			} catch {}
			function patchedLoad(spec, type) {
				capLog('capture: mw.loader.load', spec, type);
				if (typeof spec === 'string') {
					const css = isCss(spec, type);
					captured.push({
						callType: 'mw.loader.load',
						args: [ spec ].concat(css ? [ 'text/css' ] : []),
						isCss: css,
						key: spec,
						label: labelFromUrl(spec)
					});
					return; // don't execute
				}
				if (Array.isArray(spec)) {
					captured.push({
						callType: 'mw.loader.load',
						args: [ spec ],
						isCss: false,
						key: spec.join(','),
						label: spec.join(', ')
					});
					return;
				}
			}
			function patchedGetScript(url) {
				capLog('capture: mw.loader.getScript', url);
				try {
					const u = String(url || '');
					captured.push({ callType: 'mw.loader.getScript', args: [ u ], isCss: false, key: u, label: labelFromUrl(u) });
				} catch {}
				return Promise.resolve();
			}
			function patchedImportScript(title) {
				capLog('capture: importScript', title);
				try {
					const t = String(title || '');
					captured.push({ callType: 'importScript', args: [ t ], isCss: false, key: t, label: t });
				} catch {}
			}
			function patchedImportStylesheet(title) {
				capLog('capture: importStylesheet', title);
				try {
					const t = String(title || '');
					captured.push({ callType: 'importStylesheet', args: [ t ], isCss: true, key: t, label: t });
				} catch {}
			}
			function patchedImportStylesheetURI(u) {
				capLog('capture: importStylesheetURI', u);
				try {
					const s = String(u || '');
					captured.push({ callType: 'importStylesheetURI', args: [ s ], isCss: true, key: s, label: labelFromUrl(s) });
				} catch {}
			}
			// patch
			try {
				if (mw && mw.loader) {
					mw.loader.load = patchedLoad;
					if (typeof mw.loader.getScript === 'function') mw.loader.getScript = patchedGetScript;
				}
			} catch {}
			try {
				if (typeof window.importScript === 'function') window.importScript = patchedImportScript;
			} catch {}
			try {
				if (typeof window.importStylesheet === 'function') window.importStylesheet = patchedImportStylesheet;
			} catch {}
			try {
				if (typeof window.importStylesheetURI === 'function') window.importStylesheetURI = patchedImportStylesheetURI;
			} catch {}
			try {
				if (typeof runFn === 'function') runFn();
			} catch {}
			// restore
			try {
				if (ORIG.mwLoad) mw.loader.load = ORIG.mwLoad;
			} catch {}
			try {
				if (ORIG.getScript) mw.loader.getScript = ORIG.getScript;
			} catch {}
			try {
				if (ORIG.importScript) window.importScript = ORIG.importScript;
			} catch {}
			try {
				if (ORIG.importStylesheet) window.importStylesheet = ORIG.importStylesheet;
			} catch {}
			try {
				if (ORIG.importStylesheetURI) window.importStylesheetURI = ORIG.importStylesheetURI;
			} catch {}
			// render
			const items = dedupe(captured);
			try {
				window.__SM_LAST_CAPTURED = items;
				capLog('capture: done, items=', items.length);
			} catch {}
			renderCaptured(items);
		}
		function setupCaptureHooks() {
			function norm(payload) {
				if (typeof payload === 'function') return { fn: payload };
				if (payload && typeof payload === 'object' && typeof payload.fn === 'function') return { fn: payload.fn };
				return null;
			}
			try {
				if (mw && mw.hook && typeof mw.hook === 'function') {
					mw.hook('scriptManager.capture').add(function(payload) {
						const p = norm(payload);
						if (p) captureLoads(p.fn);
					});
				}
			} catch {}
			try {
				document.addEventListener('sm:capture', function(ev) {
					try {
						const d = ev && ev.detail;
						const p = norm(d);
						if (p) captureLoads(p.fn);
					} catch {}
				});
			} catch {}
		}
		setupCaptureHooks();
	})();

	function addSidebarLink() {
		try {
			if (!mw || !mw.util || typeof mw.util.addPortletLink !== 'function') return;
			const portletId = 'p-tb'; // toolbox
			const linkId = 'n-script-manager';
			let link = document.getElementById(linkId);
			function createOrUpdate(label, title) {
				if (!link) {
					link = mw.util.addPortletLink(portletId, '#', label, linkId, title);
					if (!link) return;
					link.addEventListener('click', function(e) {
						e.preventDefault();
						// SUMMARY_TAG is now handled internally by the core
						ensureCoreLoaded(function() {
							try {
								if (mw && mw.hook) {
									mw.hook('scriptManager.open').fire();
									return;
								}
							} catch {}
							try {
								document.dispatchEvent(new Event('sm:open'));
							} catch {}
						});
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
			// Create only after localized messages are available (avoid label jumping)
			loadSidebarMessages(function(msgs) {
				if (msgs && msgs.label) createOrUpdate(msgs.label, msgs.title || msgs.label);
			});
		} catch {}
	}

	function bootstrap() {
		addSidebarLink();
		if (shouldAutoload()) {
			// SUMMARY_TAG is now handled internally by the core
			ensureCoreLoaded();
		}
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', bootstrap);
	} else {
		bootstrap();
	}
})();
