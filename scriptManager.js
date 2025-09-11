/**
 * Script Manager
 * Based on [[en:User:Equazcion/ScriptInstaller]]
 * Adapted version of [[en:User:Enterprisey/script-installer]]
 * Refactoring and upgrade [[mw:User:Iniquity]]
 * Authors: Equazcion, Enterprisey, Iniquity
 * Licenses: (MIT OR CC-BY-SA-4.0)
 * Documentation: https://www.mediawiki.org/wiki/Script_Manager
*/

(function(){
    var NS = mw.config.get("wgNamespaceNumber");
    var jsPage = (function(){
        try {
            var pn = mw.config.get("wgPageName") || '';
            var cm = mw.config.get("wgPageContentModel") || '';
            return /\.js$/i.test(pn) || /\.css$/i.test(pn) || /javascript|css|sanitized-css/i.test(cm);
        } catch(_) { return true; }
    })();
    var CORE_JS = '//www.mediawiki.org/w/index.php?title=User:Iniquity/scriptManager-core.js&action=raw&ctype=text/javascript';
    var CORE_CSS = '//www.mediawiki.org/w/index.php?title=User:Iniquity/scriptManager-core.css&action=raw&ctype=text/css';
    var USER_LANG = mw.config.get('wgUserLanguage') || 'en';

    // Lightweight i18n loader: fetch our JSON (user lang, then 'en'); create only when available
    function loadSidebarMessages(callback){
        try {
            var langs = [];
            if (USER_LANG) { langs.push(USER_LANG); var base = USER_LANG.split('-')[0]; if (base && base !== USER_LANG) langs.push(base); }
            if (langs.indexOf('en') === -1) langs.push('en');
            var idx = 0;
            function tryNext(){
                if (idx >= langs.length) { if (callback) callback({ label: 'Script Manager', title: 'Script Manager' }); return; }
                var lang = langs[idx++];
                var url = 'https://gitlab-content.toolforge.org/iniquity/script-manager/-/raw/main/i18n/' + encodeURIComponent(lang) + '.json?mime=application/json';
                fetch(url).then(function(r){ if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); }).then(function(json){
                    try {
                        var label = json && (json.scriptManagerLink || json.scriptManagerTitle || json.manageUserScripts);
                        var title = json && (json.scriptManagerLinkTitle || label);
                        if (label) { if (callback) callback({ label: label, title: title }); return; }
                    } catch(_) {}
                    tryNext();
                }).catch(function(){ tryNext(); });
            }
            tryNext();
        } catch(_) { if (callback) callback({ label: 'Script Manager', title: 'Script Manager' }); }
    }

    function shouldAutoload(){
        if (NS <= 0) return false;
        if (jsPage) return true;
        if (document.getElementsByClassName("scriptInstallerLink").length) return true;
        if (document.querySelector("table.infobox-user-script")) return true;
        return false;
    }

    function loadCssOnce(){
        if (window.__SM_CSS_LOADED) return;
        try { mw.loader.load(CORE_CSS, 'text/css'); window.__SM_CSS_LOADED = true; }
        catch(_) {
            var el = document.createElement('link'); el.rel='stylesheet'; el.href=CORE_CSS; document.head.appendChild(el);
            window.__SM_CSS_LOADED = true;
        }
    }

    function ensureCoreLoaded(callback){
        loadCssOnce();
        if (window.__SM_CORE_READY) { if (callback) callback(); return; }
        if (window.__SM_CORE_LOADING) {
            (window.__SM_CORE_CBS || (window.__SM_CORE_CBS = [])).push(callback);
            return;
        }
        window.__SM_CORE_LOADING = true;
        (window.__SM_CORE_CBS || (window.__SM_CORE_CBS = [])).push(callback);
        function done(){
            window.__SM_CORE_LOADING = false;
            window.__SM_CORE_READY = true;
            try { (window.__SM_CORE_CBS || []).splice(0).forEach(function(cb){ try{ if (cb) cb(); }catch(_){} }); } catch(_) {}
        }
        if (mw.loader && typeof mw.loader.getScript === 'function') {
            mw.loader.getScript(CORE_JS).then(done);
        } else {
            var s = document.createElement('script'); s.src = CORE_JS; s.async = true; s.onload = done; document.head.appendChild(s);
        }
    }

    function addSidebarLink(){
        try {
            if (!mw || !mw.util || typeof mw.util.addPortletLink !== 'function') return;
            var portletId = 'p-tb'; // toolbox
            var linkId = 'n-script-manager';
            var link = document.getElementById(linkId);
            function createOrUpdate(label, title){
                if (!link) {
                    link = mw.util.addPortletLink(portletId, '#', label, linkId, title);
                    if (!link) return;
                    link.addEventListener('click', function(e){
                        e.preventDefault();
                        // SUMMARY_TAG is now handled internally by the core
                        ensureCoreLoaded(function(){
                            try {
                                if (mw && mw.hook) { mw.hook('scriptManager.open').fire(); return; }
                            } catch(_) {}
                            try { document.dispatchEvent(new Event('sm:open')); } catch(_) {}
                        });
                    });
                } else {
                    try { link.textContent = label; link.setAttribute('title', title); } catch(_) {}
                }
                // Move to second position in the toolbox
                var li = (link.closest && link.closest('li')) ? link.closest('li') : link.parentNode;
                var ul = li && li.parentNode;
                if (ul && li && ul.firstElementChild !== li) {
                    var firstChild = ul.firstElementChild;
                    var secondChild = firstChild && firstChild.nextElementSibling;
                    ul.insertBefore(li, secondChild || null);
                }
            }
            // Create only after localized messages are available (avoid label jumping)
            loadSidebarMessages(function(msgs){ if (msgs && msgs.label) createOrUpdate(msgs.label, msgs.title || msgs.label); });
        } catch(e) {}
    }

    function bootstrap(){
        addSidebarLink();
        if (shouldAutoload()) {
            // SUMMARY_TAG is now handled internally by the core
            ensureCoreLoaded();
        }
    }

    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', bootstrap); } else { bootstrap(); }
})();