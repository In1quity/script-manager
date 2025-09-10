/**
 * Core module for Script Manager: [[mw:User:Iniquity/scriptManager.js]]
 * Based on [[en:User:Equazcion/ScriptInstaller]]
 * Adapted version of [[en:User:Enterprisey/script-installer]]
 * Refactoring and upgrade [[mw:User:Iniquity]]
 * Authors: Equazcion, Enterprisey, Iniquity
 * Licenses: (MIT OR CC-BY-SA-4.0)
 * Documentation: https://www.mediawiki.org/wiki/Script_Manager
*/

( function () {
    // An mw.Api object
    var api;
    var metaApi;

    // Keep "common" at beginning
    var SKINS = [ "common", "global", "monobook", "minerva", "vector", "vector-2022", "timeless" ];

    // The master import list, keyed by target. (A "target" is a user JS subpage
    // where the script is imported, like "common" or "vector".) Set in buildImportList
    var imports = {};

    // Local script targets are now derived on demand from `imports` (no globals)

    // Reactive reference for Vue component
    var importsRef = null;

    // Gadgets data
    var gadgetsData = {};
    var userGadgetSettings = {};

    // Internal UI metadata (no globals)
    var gadgetSectionOrderVar = [];
    var gadgetSectionLabelsVar = {};
    var gadgetsLabelVar = 'Gadgets';
    var scriptInstallerVueComponent = null;

    // Goes on the end of edit summaries
    var SUMMARY_TAG = "([[mw:User:Iniquity/scriptManager.js|Script Manager]])";

    /**
     * Strings, for translation
     */
    var STRINGS = {};
    var STRINGS_EN = {};

    var USER_NAMESPACE_NAME = mw.config.get( "wgFormattedNamespaces" )[2];

    // Global constants (SM_ prefix per maintenance-core.js pattern)
    var SM_DEBUG_PREFIX = '[SM]';
    var SM_NOTIFICATION_DISPLAY_TIME = 4000;
    var SM_NOTIFICATION_CLEANUP_DELAY = 4200;
    var SM_USER_NAMESPACE_NUMBER = 2;
    var SM_MEDIAWIKI_NAMESPACE_NUMBER = 8;

    // Leveled logger
    var SM_LOG_LEVEL_VAR = (function(){
        try { return (window.SM_LOG_LEVEL || (window.scriptInstallerDebug ? 'debug' : 'info') || 'info').toString().toLowerCase(); }
        catch(_) { return 'info'; }
    })();
    function getLogLevel(){
        try {
            var lvl = SM_LOG_LEVEL_VAR;
            var map = { silent:0, error:1, warn:2, info:3, debug:4 };
            return map.hasOwnProperty(lvl) ? map[lvl] : 3;
        } catch(_) { return 3; }
    }
    function smLog(){
        var lvl = getLogLevel();
        if (lvl < 4) return; // debug only
        try { console.debug.apply(console, [SM_DEBUG_PREFIX].concat([].slice.call(arguments))); } catch(_) {}
    }
    function smInfo(){
        var lvl = getLogLevel();
        if (lvl < 3) return;
        try { console.info.apply(console, [SM_DEBUG_PREFIX].concat([].slice.call(arguments))); } catch(_) {}
    }
    function smWarn(){
        var lvl = getLogLevel();
        if (lvl < 2) return;
        try { console.warn.apply(console, [SM_DEBUG_PREFIX].concat([].slice.call(arguments))); } catch(_) {}
    }
    function smError(){
        var lvl = getLogLevel();
        if (lvl < 1) return;
        try { console.error.apply(console, [SM_DEBUG_PREFIX].concat([].slice.call(arguments))); } catch(_) {}
    }
    // No global exposure for logger

    // Normalize localized User namespace to canonical English for URLs
    function canonicalizeUserNamespace(title) {
        try {
            if (typeof title !== 'string') return title;
            var idx = title.indexOf(':');
            if (idx <= 0) return title;
            var ns = title.slice(0, idx);
            var rest = title.slice(idx + 1);
            if (ns === USER_NAMESPACE_NAME || ns.toLowerCase() === 'user') {
                return 'User:' + rest;
            }
            return title;
        } catch(e) { smLog('canonicalizeUserNamespace failed', e); return title; }
    }

    function buildRawLoaderUrl(host, title) {
        var normalized = canonicalizeUserNamespace(title);
        var isCss = /\.css$/i.test(String(normalized||''));
        var ctype = isCss ? 'text/css' : 'text/javascript';
        return "//" + host + "/w/index.php?title=" + normalized + "&action=raw&ctype=" + ctype;
    }

    // Lazy-load and cache Vue/Codex modules
    var _vueCodexCache = null;
    function loadVueCodex(){
        if (_vueCodexCache) return _vueCodexCache;
        _vueCodexCache = mw.loader.using(['vue', '@wikimedia/codex']).then(function(){
            var VueMod = mw.loader.require('vue');
            var CodexPkg = mw.loader.require('@wikimedia/codex');
            return {
                createApp: VueMod.createApp || VueMod.createMwApp,
                defineComponent: VueMod.defineComponent,
                ref: VueMod.ref,
                computed: VueMod.computed,
                watch: VueMod.watch,
                CdxDialog: CodexPkg.CdxDialog || (CodexPkg.components && CodexPkg.components.CdxDialog),
                CdxButton: CodexPkg.CdxButton || (CodexPkg.components && CodexPkg.components.CdxButton),
                CdxTextInput: CodexPkg.CdxTextInput || (CodexPkg.components && CodexPkg.components.CdxTextInput),
                CdxSelect: CodexPkg.CdxSelect || (CodexPkg.components && CodexPkg.components.CdxSelect),
                CdxField: CodexPkg.CdxField || (CodexPkg.components && CodexPkg.components.CdxField),
                CdxTabs: CodexPkg.CdxTabs || (CodexPkg.components && CodexPkg.components.CdxTabs),
                CdxTab: CodexPkg.CdxTab || (CodexPkg.components && CodexPkg.components.CdxTab),
                CdxToggleButton: CodexPkg.CdxToggleButton || (CodexPkg.components && CodexPkg.components.CdxToggleButton),
                CdxMessage: CodexPkg.CdxMessage || (CodexPkg.components && CodexPkg.components.CdxMessage)
            };
        });
        return _vueCodexCache;
    }

    // Safe unmount (mirrors maintenance-core.js pattern)
    function safeUnmount(app, root){
        try { if (app && typeof app.unmount === 'function') app.unmount(); } catch(e) {}
        try { if (root && root.parentNode) root.parentNode.removeChild(root); } catch(e) {}
    }

    // Mount helper
    function mountVueApp(createApp, RootComponent, rootEl){
        var app = createApp(RootComponent);
        app.mount(rootEl);
        return app;
    }

    // Generic Codex icon loader (mirrors maintenance-core.js approach)
    function smLoadCodexIconViaAPI(iconName) {
        var keyRaw = 'SM_ICON_RAW_' + iconName;
        var cached = null;
        try { cached = localStorage.getItem(keyRaw); } catch(e) {}
        if (cached) { return Promise.resolve(cached); }
        var url = 'https://www.mediawiki.org/w/api.php?action=query&format=json&formatversion=2&origin=*'
            + '&list=codexicons&names=' + encodeURIComponent(iconName);
        return fetch(url)
            .then(function(r){ return r.json(); })
            .then(function(data){
                var ci = data && data.query && data.query.codexicons;
                var raw = null;
                if (Array.isArray(ci)) {
                    var item = ci[0] || null;
                    raw = item && (item.icon || item.svg || item.value || null);
                } else if (ci && typeof ci === 'object') {
                    raw = ci[iconName] || null;
                }
                try { if (typeof raw === 'string') localStorage.setItem(keyRaw, raw); } catch(e){}
                return raw;
            }).catch(function(){ return null; });
    }

    function smRenderIconInto(el, iconName, colorHex, sizePx) {
        var keyMarkup = 'SM_ICON_MARKUP_' + iconName + '_' + (colorHex||'') + '_' + (sizePx||'');
        try { var cm = localStorage.getItem(keyMarkup); if (cm) { el.innerHTML = cm; return; } } catch(e) {}
        smLoadCodexIconViaAPI(iconName).then(function(raw){
            if (!raw || !el) return;
            var markup = '';
            var size = sizePx || 16;
            var color = colorHex || 'currentColor';
            if (typeof raw === 'string') {
                if (raw.indexOf('<svg') !== -1) { markup = raw; }
                else { markup = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="' + size + '" height="' + size + '" fill="' + color + '">' + raw + '</svg>'; }
            }
            if (markup) {
                el.innerHTML = markup;
                try { localStorage.setItem(keyMarkup, markup); } catch(e) {}
            }
        });
    }

    // Apply gadget labels to globals and Vue component
    function applyGadgetLabels(sectionLabels, gadgetsLabel){
        gadgetSectionLabelsVar = sectionLabels || {};
        gadgetsLabelVar = gadgetsLabel || 'Gadgets';
        try {
            var comp = scriptInstallerVueComponent;
            if (comp) {
                if (comp.gadgetSectionLabels && typeof comp.gadgetSectionLabels === 'object' && 'value' in comp.gadgetSectionLabels) {
                    comp.gadgetSectionLabels.value = gadgetSectionLabelsVar;
                }
                if (comp.gadgetsLabel && typeof comp.gadgetsLabel === 'object' && 'value' in comp.gadgetsLabel) {
                    comp.gadgetsLabel.value = gadgetsLabelVar;
                }
                if (typeof comp.$forceUpdate === 'function') comp.$forceUpdate();
            }
        } catch(e) { smLog('applyGadgetLabels failed', e); }
    }

    // Derive all targets where given script is installed from current imports
    function getTargetsForScript(name){
        try {
            var current = (importsRef && importsRef.value) ? importsRef.value : imports;
            var map = Object.create(null);
            Object.keys(current || {}).forEach(function(target){
                (current[target] || []).forEach(function(anImport){
                    if (anImport && anImport.page === name) { map[target] = true; }
                });
            });
            return Object.keys(map);
        } catch(e) { smLog('getTargetsForScript failed', e); return []; }
    }

    /**
     * Constructs an Import. An Import is a line in a JS file that imports a
     * user script. Properties:
     *
     *  - "page" is a page name, such as "User:Foo/Bar.js".
     *  - "wiki" is a wiki from which the script is loaded, such as
     *    "en.wikipedia". If null, the script is local, on the user's
     *    wiki.
     *  - "url" is a URL that can be passed into mw.loader.load.
     *  - "target" is the title of the user subpage where the script is,
     *    without the .js ending: for example, "common".
     *  - "disabled" is whether this import is commented out.
     *  - "type" is 0 if local, 1 if remotely loaded, and 2 if URL.
     *
     * EXACTLY one of "page" or "url" are null for every Import. This
     * constructor should not be used directly; use the factory
     * functions (Import.ofLocal, Import.ofUrl, Import.fromJs) instead.
     */
    function Import( page, wiki, url, target, disabled ) {
        this.page = page;
        this.wiki = wiki;
        this.url = url;
        this.target = target;
        this.disabled = disabled;
        this.type = this.url ? 2 : ( this.wiki ? 1 : 0 );
    }

    Import.ofLocal = function ( page, target, disabled ) {
        if( disabled === undefined ) disabled = false;
        return new Import( page, null, null, target, disabled );
    }

    /** URL to Import. Assumes wgScriptPath is "/w" */
    Import.ofUrl = function ( url, target, disabled ) {
        if( disabled === undefined ) disabled = false;
        var URL_RGX = /^(?:https?:)?\/\/(.+?)\.org\/w\/index\.php\?.*?title=(.+?(?:&|$))/;
        var match;
        if( match = URL_RGX.exec( url ) ) {
            var title = decodeURIComponent( match[2].replace( /&$/, "" ) ),
                wiki = decodeURIComponent( match[1] );
            return new Import( title, wiki, null, target, disabled );
        }
        return new Import( null, null, url, target, disabled );
    }

    Import.fromJs = function ( line, target ) {
        var IMPORT_RGX = /^\s*(\/\/)?\s*importScript\s*\(\s*(?:"|')(.+?)(?:"|')\s*\)/;
        var match;
        if( match = IMPORT_RGX.exec( line ) ) {
            return Import.ofLocal( unescapeForJsString( match[2] ), target, !!match[1] );
        }

        var LOADER_RGX = /^\s*(\/\/)?\s*mw\.loader\.load\s*\(\s*(?:"|')(.+?)(?:"|')\s*(?:,\s*(?:"|')text\/css(?:"|'))?\s*\)/;
        if( match = LOADER_RGX.exec( line ) ) {
            return Import.ofUrl( unescapeForJsString( match[2] ), target, !!match[1] );
        }
    }

    Import.prototype.getDescription = function ( useWikitext ) {
        switch( this.type ) {
            case 0: return useWikitext ? ( "[[" + this.page + "]]" ) : this.page;
            case 1: return SM_t('remoteUrlDesc').replace( "$1", this.page ).replace( "$2", this.wiki );
            case 2: return this.url;
        }
    }

    // Removed getHumanUrl in favor of component-level helper getImportHumanUrl

    // Removed unused getHumanUrl()

    Import.prototype.toJs = function () {
        var dis = this.disabled ? "//" : "";
        var host = (this.type === 1 ? (this.wiki + ".org") : mw.config.get('wgServerName'));
        var title = (this.type === 2 ? null : this.page);
        var url = (this.type === 2)
            ? this.url
            : buildRawLoaderUrl(host, title);
        var backlinkText = (this.type === 0 && this.target === 'global') ? STRINGS_EN.backlink : SM_t('backlink');

        var suffix = (this.type === 2)
            ? ""
            : (" // " + backlinkText + " [[" + escapeForJsComment( this.page ) + "]]");

        var isCss = /\.css$/i.test(String(this.page||''));
        var typeArg = isCss ? ", 'text/css'" : "";
        return dis + "mw.loader.load('" + escapeForJsString( url ) + "'" + typeArg + ");" + suffix;
    }

    /**
     * Installs the import.
     */
    Import.prototype.install = function (options) {
        options = options || {};
        var targetApi = getApiForTarget( this.target );
        var req = targetApi.postWithEditToken( {
            action: "edit",
            title: getFullTarget( this.target ),
            summary: getSummaryForTarget( this.target, 'installSummary', this.getDescription( /* useWikitext */ true ) ),
            appendtext: "\n" + this.toJs()
        } );
        if (options.silent) return req;
        return req.then(function() {
            showNotification('notificationInstallSuccess', 'success', this.getDescription());
        }.bind(this)).catch(function(error) {
            smError('Install failed:', error);
            showNotification('notificationInstallError', 'error', this.getDescription());
            throw error;
        }.bind(this));
    }

    /**
     * Get all line numbers from the target page that mention
     * the specified script.
     */
    Import.prototype.getLineNums = function ( targetWikitext ) {
        function quoted( s ) {
            return new RegExp( "(['\"])" + escapeForRegex( s ) + "\\1" );
        }
        var toFind;
        switch( this.type ) {
            case 0: toFind = quoted( escapeForJsString( this.page ) ); break;
            case 1: 
                // For cross-wiki scripts, try multiple patterns to find the script
                var pageName = this.page.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' ); // Escape regex special chars
                // Try exact match first
                toFind = new RegExp( pageName );
                smLog('getLineNums - type 1 exact pattern:', toFind, 'wiki:', this.wiki, 'page:', this.page);
                break;
            case 2: toFind = quoted( escapeForJsString( this.url ) ); break;
        }
        var lineNums = [], lines = targetWikitext.split( "\n" );
        for( var i = 0; i < lines.length; i++ ) {
            if( toFind.test( lines[i] ) ) {
                smLog('Found matching line', i, ':', lines[i]);
                lineNums.push( i );
            }
        }
        smLog('getLineNums result:', lineNums);
        return lineNums;
    }

    /**
     * Uninstalls the given import. That is, delete all lines from the
     * target page that import the specified script.
     */
    Import.prototype.uninstall = function (options) {
        options = options || {};
        var that = this;
        var chain = getWikitext( getFullTarget( this.target ) ).then( function ( wikitext ) {
            var lineNums = that.getLineNums( wikitext ),
                newWikitext = wikitext.split( "\n" ).filter( function ( _, idx ) {
                    return lineNums.indexOf( idx ) < 0;
                } ).join( "\n" );
            return getApiForTarget( that.target ).postWithEditToken( {
                action: "edit",
                title: getFullTarget( that.target ),
                summary: getSummaryForTarget( that.target, 'uninstallSummary', that.getDescription( /* useWikitext */ true ) ),
                text: newWikitext
            } );
        } );
        if (options.silent) return chain;
        return chain.then(function() {
            showNotification('notificationUninstallSuccess', 'success', that.getDescription());
        }).catch(function(error) {
            smError('Uninstall failed:', error);
            showNotification('notificationUninstallError', 'error', that.getDescription());
            throw error;
        });
    }

    /**
     * Sets whether the given import is disabled, based on the provided
     * boolean value.
     */
    Import.prototype.setDisabled = function ( disabled ) {
        var that = this;
        this.disabled = disabled;
        return getWikitext( getFullTarget( this.target ) ).then( function ( wikitext ) {
            var lineNums = that.getLineNums( wikitext ),
                newWikitextLines = wikitext.split( "\n" );

            if( disabled ) {
                lineNums.forEach( function ( lineNum ) {
                    if( newWikitextLines[lineNum].trim().indexOf( "//" ) != 0 ) {
                        newWikitextLines[lineNum] = "//" + newWikitextLines[lineNum].trim();
                    }
                } );
            } else {
                lineNums.forEach( function ( lineNum ) {
                    if( newWikitextLines[lineNum].trim().indexOf( "//" ) == 0 ) {
                        newWikitextLines[lineNum] = newWikitextLines[lineNum].replace( /^\s*\/\/\s*/, "" );
                    }
                } );
            }

            var summaryKey = disabled ? 'disableSummary' : 'enableSummary';
            var summary = getSummaryForTarget( that.target, summaryKey, that.getDescription( /* useWikitext */ true ) );
            return getApiForTarget( that.target ).postWithEditToken( {
                action: "edit",
                title: getFullTarget( that.target ),
                summary: summary,
                text: newWikitextLines.join( "\n" )
            } );
        } ).then(function() {
            var notificationKey = disabled ? 'notificationDisableSuccess' : 'notificationEnableSuccess';
            showNotification(notificationKey, 'success', that.getDescription());
        }).catch(function(error) {
            smError('Set disabled failed:', error);
            var notificationKey = disabled ? 'notificationDisableError' : 'notificationEnableError';
            showNotification(notificationKey, 'error', that.getDescription());
        });
    }

    Import.prototype.toggleDisabled = function () {
        this.disabled = !this.disabled;
        return this.setDisabled( this.disabled );
    }

    /**
     * Move this import to another file.
     */
    Import.prototype.move = function ( newTarget ) {
        if( this.target === newTarget ) return;
        smLog('Import.move - moving from', this.target, 'to', newTarget);
        var that = this;
        var old = new Import( this.page, this.wiki, this.url, this.target, this.disabled );
        this.target = newTarget;
        smLog('Import.move - calling install then uninstall');
        // 1) Try to install to the new place
        // 2) Only after successful install, uninstall from the old place
        return this.install({silent:true}).then(function(){
            return old.uninstall({silent:true});
        }).then(function(){
            showNotification('notificationMoveSuccess', 'success', that.getDescription());
        }).catch(function(error){
            smError('Move failed:', error);
            showNotification('notificationMoveError', 'error', that.getDescription());
        });
    }

    function getAllTargetWikitexts() {
        var localSkins = SKINS.filter(function(skin) { return skin !== 'global'; });
        var localTitles = localSkins.map( getFullTarget ).join( "|" );
        var globalTitle = getFullTarget( 'global' );
        
        var localPromise = api.get({
                action: "query",
                prop: "revisions",
                rvprop: "content",
                rvslots: "main",
            titles: localTitles
        });
        
        var globalPromise = metaApi.get({
            action: "query",
            prop: "revisions",
            rvprop: "content",
            rvslots: "main",
            titles: globalTitle
        });
        
        return $.when(localPromise, globalPromise).then( function ( localData, globalData ) {
            
            var result = {};
            prefixLength = mw.config.get( "wgUserName" ).length + USER_NAMESPACE_NAME.length + 1;
            
            // Process local skins - mw.ForeignApi returns data in different format
            var localPages = localData && localData.query && localData.query.pages ? localData.query.pages : 
                           (localData && localData[0] && localData[0].query && localData[0].query.pages ? localData[0].query.pages : null);
            if( localPages ) {
                Object.values( localPages ).forEach( function ( moreData ) {
                    var nameWithoutExtension = new mw.Title( moreData.title ).getNameText();
                    var targetName = nameWithoutExtension.substring( nameWithoutExtension.indexOf( "/" ) + 1 );
                    result[targetName] = moreData.revisions ? moreData.revisions[0].slots.main["*"] : null;
                } );
            }
            
            // Process global skin - mw.ForeignApi returns data in different format
            var globalPages = globalData && globalData.query && globalData.query.pages ? globalData.query.pages : 
                            (globalData && globalData[0] && globalData[0].query && globalData[0].query.pages ? globalData[0].query.pages : null);
            if( globalPages ) {
                Object.values( globalPages ).forEach( function ( moreData ) {
                    var nameWithoutExtension = new mw.Title( moreData.title ).getNameText();
                    var targetName = nameWithoutExtension.substring( nameWithoutExtension.indexOf( "/" ) + 1 );
                    result[targetName] = moreData.revisions ? moreData.revisions[0].slots.main["*"] : null;
                } );
            }
            
            return result;
        } ).fail( function( error ) {
            // Fallback: try to load only local skins
            return api.get({
                action: "query",
                prop: "revisions",
                rvprop: "content",
                rvslots: "main",
                titles: SKINS.filter(function(skin) { return skin !== 'global'; }).map( getFullTarget ).join( "|" )
            }).then( function ( data ) {
                var result = {};
                    prefixLength = mw.config.get( "wgUserName" ).length + USER_NAMESPACE_NAME.length + 1;
                if( data && data.query && data.query.pages ) {
                Object.values( data.query.pages ).forEach( function ( moreData ) {
                    var nameWithoutExtension = new mw.Title( moreData.title ).getNameText();
                    var targetName = nameWithoutExtension.substring( nameWithoutExtension.indexOf( "/" ) + 1 );
                    result[targetName] = moreData.revisions ? moreData.revisions[0].slots.main["*"] : null;
                } );
            }
                return result;
            } );
        } );
    }

    var _pBuildImportList = null;
    function buildImportList() {
        if (_pBuildImportList) return _pBuildImportList;
        _pBuildImportList = getAllTargetWikitexts().then( function ( wikitexts ) {
            Object.keys( wikitexts ).forEach( function ( targetName ) {
                var targetImports = [];
                if( wikitexts[ targetName ] ) {
                    var lines = wikitexts[ targetName ].split( "\n" );
                    var currImport;
                    for( var i = 0; i < lines.length; i++ ) {
                        if( currImport = Import.fromJs( lines[i], targetName ) ) {
                            targetImports.push( currImport );
                        }
                    }
                }
                imports[ targetName ] = targetImports;
            } );
            
            // Update reactive reference if it exists
            if (importsRef) {
                importsRef.value = imports;
            }
        } ).catch(function(err){ _pBuildImportList = null; throw err; });
        return _pBuildImportList;
    }

    var _pLoadGadgets = null;
    function loadGadgets() {
        if (_pLoadGadgets) return _pLoadGadgets;
        _pLoadGadgets = api.get({
            action: 'query',
            list: 'gadgets',
            gaprop: 'id|desc|metadata',
            format: 'json'
        }).then(function(data) {
            if (data && data.query && data.query.gadgets) {
                // Convert array to object format, filtering out hidden gadgets
                gadgetsData = {};
                data.query.gadgets.forEach(function(gadget) {
                    // Skip hidden gadgets (only show gadgets that don't have hidden property)
                    if (gadget.metadata && gadget.metadata.settings && 'hidden' in gadget.metadata.settings) {
                        return;
                    }
                    
                    // Get section for categorization
                    var section = 'other';
                    if (gadget.metadata && gadget.metadata.settings && gadget.metadata.settings.section) {
                        section = gadget.metadata.settings.section;
                    }
                    
                    // Check if gadget is enabled by default
                    var isDefault = gadget.metadata && gadget.metadata.settings && 
                                   gadget.metadata.settings.default === '';
                    
                    gadgetsData[gadget.id] = {
                        name: gadget.id,
                        description: gadget.desc || SM_t('noDescriptionAvailable'),
                        section: section,
                        isDefault: isDefault
                    };
                });
                
                return gadgetsData;
            } else {
                gadgetsData = {};
                return gadgetsData;
            }
        }).catch(function(error) {
            smError('Failed to load gadgets:', error);
            gadgetsData = {};
            return gadgetsData;
        }).finally(function(){ _pLoadGadgets = null; });
        return _pLoadGadgets;
    }

    function loadSectionOrder() {
        return api.get({
            action: 'query',
            titles: 'MediaWiki:Gadgets-definition',
            prop: 'extracts',
            exintro: true,
            explaintext: true,
            format: 'json'
        }).then(function(data) {
            var page = Object.values(data.query.pages)[0];
            if (page && page.extract) {
                // Parse the page content to extract section order
                var content = page.extract;
                var sectionOrder = [];
                
                // Look for section headers (## section-name)
                var lines = content.split('\n');
                lines.forEach(function(line) {
                    var match = line.match(/^##\s+(\w+)/);
                    if (match) {
                        sectionOrder.push(match[1]);
                    }
                });
                
                return sectionOrder;
            } else {
                // No fallback - return empty array if page not found
                return [];
            }
        }).catch(function() {
            // No fallback - return empty array on error
            return [];
        });
    }

    function loadGadgetsLabel() {
        smInfo('Loading gadgets label from system messages');
        return api.get({
            action: 'query',
            meta: 'allmessages',
            ammessages: 'prefs-gadgets',
            format: 'json'
        }).then(function(msgData) {
            smLog('System message response:', msgData);
            if (msgData.query && msgData.query.allmessages && msgData.query.allmessages[0] && msgData.query.allmessages[0]['*']) {
                var label = msgData.query.allmessages[0]['*'];
                smInfo('Loaded gadgets label from system message:', label);
                return label;
            } else {
                smWarn('No system message found, using fallback');
                return 'Gadgets'; // Fallback
            }
        }).catch(function() {
            smWarn('Error loading system message, using fallback');
            return 'Gadgets'; // Fallback
        });
    }

    function loadSectionLabels() {
        // Get unique sections from loaded gadgets
        var sections = new Set();
        Object.values(gadgetsData).forEach(function(gadget) {
            sections.add(gadget.section);
        });
        
        // Create promises for all section label requests
        var sectionPromises = [];
        sections.forEach(function(section) {
            if (section !== 'other') {
                sectionPromises.push(
                    api.get({
                        action: 'query',
                        titles: 'MediaWiki:Gadget-section-' + section,
                        prop: 'extracts',
                        exintro: true,
                        explaintext: true,
                        format: 'json'
                    }).then(function(data) {
                        var page = Object.values(data.query.pages)[0];
                        if (page && page.extract) {
                            return {
                                section: section,
                                label: page.extract.trim()
                            };
                        } else {
                            return {
                                section: section,
                                label: section.charAt(0).toUpperCase() + section.slice(1)
                            };
                        }
                    }).catch(function() {
                        return {
                            section: section,
                            label: section.charAt(0).toUpperCase() + section.slice(1)
                        };
                    })
                );
            }
        });
        
        // Return promise that resolves when all labels are loaded
        return Promise.all(sectionPromises).then(function(labels) {
            var sectionLabels = {};
            labels.forEach(function(item) {
                sectionLabels[item.section] = item.label;
            });
            return sectionLabels;
        });
    }

    var _pLoadUserGadgetSettings = null;
    function loadUserGadgetSettings() {
        if (_pLoadUserGadgetSettings) return _pLoadUserGadgetSettings;
        _pLoadUserGadgetSettings = api.get({
            action: 'query',
            meta: 'userinfo',
            uiprop: 'options'
        }).then(function(data) {
            var options = data.query.userinfo.options || {};
            userGadgetSettings = {};
            
            // Extract gadget settings
            Object.keys(options).forEach(function(key) {
                if (key.startsWith('gadget-')) {
                    userGadgetSettings[key] = options[key];
                }
            });
            
            return userGadgetSettings;
        }).catch(function(error) {
            smError('Failed to load user gadget settings:', error);
            userGadgetSettings = {};
            return {};
        }).finally(function(){ _pLoadUserGadgetSettings = null; });
        return _pLoadUserGadgetSettings;
    }

    function toggleGadget(gadgetName, enabled) {
        return api.postWithToken('csrf', {
            action: 'options',
            optionname: 'gadget-' + gadgetName,
            optionvalue: enabled ? '1' : '0'
        }).then(function(response) {
            // Update local settings
            userGadgetSettings['gadget-' + gadgetName] = enabled ? '1' : '0';
            return true;
        }).catch(function(error) {
            smError('Failed to toggle gadget:', error);
            throw error;
        });
    }


    /*
     * "Normalizes" (standardizes the format of) lines in the given
     * config page.
     */
    function normalize( target ) {
        return getWikitext( getFullTarget( target ) ).then( function ( wikitext ) {
            var lines = wikitext.split( "\n" ),
                newLines = Array( lines.length ),
                currImport;
            for( var i = 0; i < lines.length; i++ ) {
                if( currImport = Import.fromJs( lines[i], target ) ) {
                    newLines[i] = currImport.toJs();
                } else {
                    newLines[i] = lines[i];
                }
            }
            return getApiForTarget( target ).postWithEditToken( {
                action: "edit",
                title: getFullTarget( target ),
                summary: SM_t('normalizeSummary'),
                text: newLines.join( "\n" )
            } );
        } ).then(function() {
            showNotification('notificationNormalizeSuccess', 'success');
        }).catch(function(error) {
            smError('Normalize failed:', error);
            showNotification('notificationNormalizeError', 'error');
        });
    }

    function reloadAfterChange(){
        try { location.reload(true); } catch(e) { smLog('reloadAfterChange error', e); }
    }

    /********************************************
     *
     * Notification system
     *
     ********************************************/
    function getMessageStack() {
        var stack = document.getElementById('sm-message-stack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'sm-message-stack';
            stack.className = 'sm-message-stack';
            try {
                stack.setAttribute('aria-live', 'polite');
                stack.setAttribute('aria-atomic', 'true');
            } catch(_) {}
            document.body.appendChild(stack);
        }
        return stack;
    }

    function showNotification(messageKeyOrText, type, param) {
        var message;
        if (typeof messageKeyOrText === 'string') {
            // Localized message (with optional parameter) via SM_t
            var localized = (typeof t === 'function' ? t(messageKeyOrText) : (typeof SM_t === 'function' ? SM_t(messageKeyOrText) : messageKeyOrText));
            message = (param !== undefined && typeof localized === 'string') ? localized.replace('$1', param) : localized;
        } else {
            message = messageKeyOrText;
        }
        
        var status = 'notice';
        if (type === 'success') status = 'success';
        else if (type === 'warning') status = 'warning';
        else if (type === 'error') status = 'error';
        
        mw.loader.using(['vue', '@wikimedia/codex']).then(function() {
            try {
                var VueMod = mw.loader.require('vue');
                var CodexPkg = mw.loader.require('@wikimedia/codex');
                
                var createApp = VueMod.createApp || VueMod.createMwApp;
                var CdxMessage = CodexPkg.CdxMessage || (CodexPkg.components && CodexPkg.components.CdxMessage);
                
                if (!createApp || !CdxMessage) {
                    throw new Error('Codex components not available');
                }
                
                var stack = getMessageStack();
                var host = document.createElement('div');
                host.className = 'sm-message-host';
                try {
                    if (status === 'error' || status === 'warning') {
                        host.setAttribute('role', 'alert');
                        host.setAttribute('aria-live', 'assertive');
                    } else {
                        host.setAttribute('role', 'status');
                        host.setAttribute('aria-live', 'polite');
                    }
                } catch(_) {}
                stack.appendChild(host);
                
                var app = createApp({
                    data: function(){ 
                        return { 
                            type: status, 
                            message: message, 
                            show: true 
                        }; 
                    },
                    template: '<transition name="sm-fade"><CdxMessage v-if="show" :type="type" :fade-in="true" :allow-user-dismiss="true" :auto-dismiss="true" :display-time="'+SM_NOTIFICATION_DISPLAY_TIME+'"><div v-html="message"></div></CdxMessage></transition>'
                });
                
                app.component('CdxMessage', CdxMessage);
                app.mount(host);
                
                setTimeout(function(){ 
                    try {
                        app.unmount();
                        if (host.parentNode) {
                            host.parentNode.removeChild(host);
                        }
                    } catch(e) {}
                }, SM_NOTIFICATION_CLEANUP_DELAY);
            } catch(e) { 
                smError('showNotification error:', e); 
            }
        });
    }

    /********************************************
     *
     * UI code
     *
     ********************************************/
    function makePanel() {
        // Create container for Vue app
        var container = $( "<div>" ).attr( "id", "sm-panel" );
        smLog('makePanel: create container #sm-panel');
        
        // Load Vue and Codex
        loadVueCodex().then(function(libs) {
            smLog('makePanel: libs loaded, building panel');
            if (!libs.createApp || !libs.CdxDialog || !libs.CdxButton || !libs.CdxTextInput || !libs.CdxSelect || !libs.CdxField || !libs.CdxTabs || !libs.CdxTab || !libs.CdxToggleButton) {
                throw new Error('Codex/Vue components not available');
            }
            // Pass container[0] down so we can unmount exactly this root
            createVuePanel(container, libs.createApp, libs.defineComponent, libs.ref, libs.computed, libs.watch, libs.CdxDialog, libs.CdxButton, libs.CdxTextInput, libs.CdxSelect, libs.CdxField, libs.CdxTabs, libs.CdxTab, libs.CdxToggleButton);
        }).catch(function(error) {
            smError('Failed to load Vue/Codex:', error);
            container.html('<div class="error">Failed to load interface. Please refresh the page.</div>');
        });
        
        return container;
    }

    function createVuePanel(container, createApp, defineComponent, ref, computed, watch, CdxDialog, CdxButton, CdxTextInput, CdxSelect, CdxField, CdxTabs, CdxTab, CdxToggleButton) {
        // Make imports reactive and set global reference
        smLog('createVuePanel: start');
        importsRef = ref(imports);
        var rootEl = container[0];
        
        var app; // to unmount on close
        var ScriptManager = defineComponent({
            components: { CdxDialog, CdxButton, CdxTextInput, CdxSelect, CdxField, CdxTabs, CdxTab, CdxToggleButton },
            setup() {
                var dialogOpen = ref(true);
                var filterText = ref('');
                var selectedSkin = ref('common');
                var loadingStates = ref({});
                var removedScripts = ref([]);
                var gadgetSectionLabels = ref(gadgetSectionLabelsVar || {});
                var gadgetsLabel = ref(gadgetsLabelVar || 'Gadgets');
                var enabledOnly = ref(false);
                var reloadOnClose = ref(false);

                try {
                    if (watch) {
                        watch(dialogOpen, function(v){
                            smLog('Panel: dialogOpen changed ->', v, 'reloadOnClose=', reloadOnClose.value);
                            if (v === false) {
                                if (reloadOnClose.value) { reloadOnClose.value = false; setTimeout(function(){ reloadAfterChange(); }, 0); }
                                // immediate unmount/remove just like maintenance-core
                                try { safeUnmount(app, rootEl); } catch(e) { smLog('Panel: safeUnmount error', e); }
                            }
                        });
                    }
                } catch(e) { smLog('watch(dialogOpen) failed', e); }

                var onPanelClose = function(){
                    smLog('Panel: close button clicked');
                    dialogOpen.value = false;
                };

                // Create skin tabs
                var skinTabs = computed(function() {
                    return [
                        { name: 'all', label: SM_t('allSkins') },
                        { name: 'gadgets', label: gadgetsLabel.value },
                        { name: 'global', label: 'global' },
                        { name: 'common', label: 'common' }             
                    ].concat(SKINS.filter(function(skin) { return skin !== 'common' && skin !== 'global'; }).map(function(skin) {
                        return { name: skin, label: skin };
                    }));
                });
                
                var filteredImports = computed(function() {
                    var result = {};
                    
                    // Handle gadgets tab separately
                    if (selectedSkin.value === 'gadgets') {
                        // Group gadgets by section
                        var groupedGadgets = {};
                        Object.keys(gadgetsData).forEach(function(gadgetName) {
                            var gadget = gadgetsData[gadgetName];
                            var section = gadget.section || 'other';
                            
                            // Filter by enabledOnly if enabled
                            if (enabledOnly.value && !isGadgetEnabled(gadgetName)) {
                                return;
                            }
                            
                            if (!groupedGadgets[section]) {
                                groupedGadgets[section] = {};
                            }
                            groupedGadgets[section][gadgetName] = gadget;
                        });
                        
                        // Get section order from loaded data
                        var sectionOrder = gadgetSectionOrderVar || [];
                        
                        // Sort sections according to loaded order
                        var sortedSections = sectionOrder.filter(function(section) {
                            return groupedGadgets[section];
                        });
                        
                        // Add any remaining sections not in the order
                        Object.keys(groupedGadgets).forEach(function(section) {
                            if (sortedSections.indexOf(section) === -1) {
                                sortedSections.push(section);
                            }
                        });
                        sortedSections.forEach(function(section) {
                            var sectionGadgets = groupedGadgets[section];
                            var sortedGadgets = {};
                            Object.keys(sectionGadgets).sort().forEach(function(gadgetName) {
                                sortedGadgets[gadgetName] = sectionGadgets[gadgetName];
                            });
                            result[section] = {
                                gadgets: sortedGadgets,
                                label: section.charAt(0).toUpperCase() + section.slice(1) // Temporary label
                            };
                        });
                        
                        return result;
                    }
                    
                    if (importsRef.value) {
                        // Define the order: common first, then global, then others
                        var orderedKeys = ['common', 'global'];
                        var allKeys = Object.keys(importsRef.value);
                        
                        // Add other keys (excluding common and global) in alphabetical order
                        allKeys.filter(function(key) { 
                            return key !== 'common' && key !== 'global'; 
                        }).sort().forEach(function(key) {
                            orderedKeys.push(key);
                        });
                        
                        orderedKeys.forEach(function(targetName) {
                            if (!importsRef.value[targetName]) return;
                            
                            // Filter by selected skin
                            if (selectedSkin.value !== 'all') {
                                if (selectedSkin.value !== targetName) {
                                    return;
                                }
                            }
                            
                            var targetImports = importsRef.value[targetName];
                            if (targetImports && targetImports.length > 0) {
                                // Filter by enabledOnly if enabled
                                if (enabledOnly.value) {
                                    targetImports = targetImports.filter(function(anImport) {
                                        return !anImport.disabled;
                                    });
                                }
                                
                                if (filterText.value && filterText.value.trim()) {
                                    var filtered = targetImports.filter(function(anImport) {
                                        return anImport.getDescription().toLowerCase().indexOf(filterText.value.toLowerCase()) >= 0;
                                    });
                                    if (filtered.length > 0) {
                                        result[targetName] = filtered;
                                    }
                                } else {
                                    result[targetName] = targetImports;
                                }
                            }
                        });
                    }
                    
                    return result;
                });
                
                var setLoading = function(key, value) {
                    loadingStates.value[key] = value;
                };
                
                var handleNormalize = function(targetName) {
                    var key = 'normalize-' + targetName;
                    setLoading(key, true);
                    normalize(targetName).done(function() {
                        reloadOnClose.value = true;
                    }).fail(function(error) {
                        smError('Failed to normalize:', error);
                        showNotification('notificationNormalizeError', 'error');
                    }).always(function() {
                        setLoading(key, false);
                    });
                };
                
                var handleUninstall = function(anImport) {
                    var key = 'uninstall-' + anImport.getDescription();
                    var scriptName = anImport.getDescription();
                    var isRemoved = removedScripts.value.includes(scriptName);
                    
                    setLoading(key, true);
                    
                    if (isRemoved) {
                        // Restore script
                        anImport.install().done(function() {
                            // Remove from removed list
                            var index = removedScripts.value.indexOf(scriptName);
                            if (index > -1) {
                                removedScripts.value.splice(index, 1);
                            }
                            reloadOnClose.value = true;
                        }).fail(function(error) {
                            smError('Failed to restore:', error);
                            showNotification('notificationRestoreError', 'error', anImport.getDescription());
                        }).always(function() {
                            setLoading(key, false);
                        });
                    } else {
                        // Remove script
                        anImport.uninstall().done(function() {
                            // Add to removed list
                            removedScripts.value.push(scriptName);
                            reloadOnClose.value = true;
                        }).fail(function(error) {
                            smError('Failed to uninstall:', error);
                            showNotification('notificationUninstallError', 'error', anImport.getDescription());
                        }).always(function() {
                            setLoading(key, false);
                        });
                    }
                };
                
                var handleToggleDisabled = function(anImport) {
                    var key = 'toggle-' + anImport.getDescription();
                    setLoading(key, true);
                    anImport.toggleDisabled().done(function() {
                        reloadOnClose.value = true;
                    }).fail(function(error) {
                        smError('Failed to toggle disabled state:', error);
                        showNotification('notificationGeneralError', 'error');
                    }).always(function() {
                        setLoading(key, false);
                    });
                };
                
                var handleMove = function(anImport) {
                    showMoveDialog(anImport);
                    // Reload will be triggered by move dialog itself; but also reload after closing main panel if further actions occurred
                };
                
                var handleNormalizeAll = function() {
                    var targets = Object.keys(filteredImports.value);
                    if (targets.length === 0) return;
                    
                    var normalizePromises = targets.map(function(targetName) {
                        var key = 'normalize-' + targetName;
                        setLoading(key, true);
                        return normalize(targetName).always(function() {
                            setLoading(key, false);
                        });
                    });
                    
                    $.when.apply($, normalizePromises).done(function() {
                        reloadOnClose.value = true;
                    }).fail(function(error) {
                        smError('Failed to normalize some scripts:', error);
                        showNotification('notificationNormalizeError', 'error');
                    });
                };

                var handleGadgetToggle = function(gadgetName, enabled) {
                    var key = 'gadget-' + gadgetName;
                    setLoading(key, true);
                    
                    toggleGadget(gadgetName, enabled).then(function() {
                        showNotification('Gadget ' + gadgetName + ' ' + (enabled ? 'enabled' : 'disabled'), 'success');
                        reloadOnClose.value = true;
                    }).catch(function(error) {
                        smError('Failed to toggle gadget:', error);
                        showNotification('Failed to toggle gadget', 'error');
                    }).always(function() {
                        setLoading(key, false);
                    });
                };

                var isGadgetEnabled = function(gadgetName) {
                    // Check if gadget is explicitly enabled in user settings
                    if (userGadgetSettings['gadget-' + gadgetName] === '1') {
                        return true;
                    }
                    
                    // Check if gadget is disabled in user settings
                    if (userGadgetSettings['gadget-' + gadgetName] === '0') {
                        return false;
                    }
                    
                    // If not in user settings, check if it's enabled by default
                    var gadget = gadgetsData[gadgetName];
                    if (gadget && gadget.isDefault) {
                        return true;
                    }
                    
                    return false;
                };
                
                var getSkinUrl = function(skinName) {
                    if (skinName === 'global') {
                        return 'https://meta.wikimedia.org/wiki/User:' + mw.config.get('wgUserName') + '/global.js';
                    } else {
                        return 'https://' + mw.config.get('wgServerName') + '/wiki/User:' + mw.config.get('wgUserName') + '/' + skinName + '.js';
                    }
                };
                var getImportHumanUrl = function(anImport){
                    var page = canonicalizeUserNamespace(anImport.page);
                    if (anImport.type === 0) return '/wiki/' + encodeURI(page);
                    if (anImport.type === 1) return '//' + anImport.wiki + '.org/wiki/' + encodeURI(page);
                    return anImport.url;
                };
                
                return {
                    dialogOpen,
                    filterText,
                    selectedSkin,
                    skinTabs,
                    filteredImports,
                    loadingStates,
                    removedScripts,
                    gadgetSectionLabels,
                    gadgetsLabel,
                    enabledOnly,
                    handleNormalize,
                    handleUninstall,
                    handleToggleDisabled,
                    handleMove,
                    handleNormalizeAll,
                    handleGadgetToggle,
                    isGadgetEnabled,
                    getSkinUrl,
                    getImportHumanUrl,
                    SM_t: t,
                    SKINS: SKINS,
                    mw: mw,
                    onPanelClose
                };
            },
            template: `
                <cdx-dialog
                    class="sm-cdx-dialog"
                    v-model:open="dialogOpen"
                    :title="SM_t('scriptManagerTitle')"
                    :use-close-button="true"
                    @close="onPanelClose"
                >
                    <div class="sm-subtitle">
                        {{ SM_t('panelHeader') }}
                    </div>
                    <div class="sm-controls">
                        <div class="sm-search-wrap">
                            <cdx-text-input
                                v-model="filterText"
                                :placeholder="SM_t('quickFilter')"
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
                                <cdx-toggle-button v-model="enabledOnly" :aria-label="SM_t('enabledOnly')">
                                    {{ SM_t('enabledOnly') }}
                                </cdx-toggle-button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="sm-scroll">
                        <!-- Gadgets tab -->
                        <template v-if="selectedSkin === 'gadgets'">
                            <div class="gadgets-section">
                                <div v-if="Object.keys(filteredImports).length === 0" class="no-gadgets">
                                    <p>{{ SM_t('noGadgetsAvailable') }}</p>
                                    <p>{{ SM_t('thisMightBeBecause') }}</p>
                                    <ul>
                                        <li>{{ SM_t('gadgetsNotInstalled') }}</li>
                                        <li>{{ SM_t('noGadgetsConfigured') }}</li>
                                        <li>{{ SM_t('apiAccessRestricted') }}</li>
                                    </ul>
                                </div>
                                <div v-else class="gadgets-list">
                                    <div v-for="(sectionData, sectionName) in filteredImports" :key="sectionName" class="gadget-section">
                                        <h4 class="gadget-section-title">{{ gadgetSectionLabels[sectionName] || sectionData.label }}</h4>
                                        <div class="gadget-section-content">
                                            <cdx-card 
                                                v-for="(gadget, gadgetName) in sectionData.gadgets" 
                                                :key="gadgetName"
                                                class="gadget-item"
                                                :class="{ 
                                                    enabled: isGadgetEnabled(gadgetName)
                                                }"
                                            >
                                                <div class="gadget-info">
                                                    <div class="gadget-name">{{ gadgetName }}</div>
                                                    <div class="gadget-description" v-if="gadget.description" v-html="gadget.description"></div>
                                                </div>
                                                
                                                <div class="gadget-actions">
                                                    <cdx-button 
                                                        weight="quiet" 
                                                        size="small"
                                                        :disabled="loadingStates['gadget-' + gadgetName]"
                                                        @click="handleGadgetToggle(gadgetName, !isGadgetEnabled(gadgetName))"
                                                    >
                                                        {{ loadingStates['gadget-' + gadgetName] ? '...' : 
                                                           (isGadgetEnabled(gadgetName) ? SM_t('disableLinkText') : SM_t('enableLinkText')) }}
                                                    </cdx-button>
                                                </div>
                                            </cdx-card>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </template>
                        
                        <!-- Scripts tabs -->
                        <template v-else>
                            <div v-for="(targetImports, targetName) in filteredImports" :key="targetName" class="script-target-section">
                            <h3>
                                <template v-if="targetName === 'common'">
                                    <a :href="getSkinUrl(targetName)" target="_blank">
                                        {{ SM_t('skinCommon') }}
                                    </a>
                                </template>
                                <template v-else-if="targetName === 'global'">
                                    <a :href="getSkinUrl(targetName)" target="_blank">
                                        {{ SM_t('globalAppliesToAllWikis') }}
                                    </a>
                                </template>
                                <template v-else>
                                    <a :href="getSkinUrl(targetName)" target="_blank">
                                        {{ targetName }}
                                    </a>
                                </template>
                            </h3>
                            
                            <div class="script-list">
                                <cdx-card 
                                    v-for="anImport in targetImports" 
                                    :key="anImport.getDescription()"
                                    class="script-item"
                                    :class="{ 
                                        disabled: anImport.disabled,
                                        'script-item-removed': removedScripts.includes(anImport.getDescription())
                                    }"
                                >
                                    <div class="script-info">
                                        <a :href="getImportHumanUrl(anImport)" class="script-link">
                                            {{ anImport.getDescription() }}
                                        </a>
                                    </div>
                                    
                                    <div class="script-actions">                                        
                                        <cdx-button 
                                            weight="quiet" 
                                            size="small"
                                            :disabled="loadingStates['toggle-' + anImport.getDescription()]"
                                            @click="handleToggleDisabled(anImport)"
                                        >
                                            {{ loadingStates['toggle-' + anImport.getDescription()] ? '...' : (anImport.disabled ? SM_t('enableLinkText') : SM_t('disableLinkText')) }}
                                        </cdx-button>
                                        
                                        <cdx-button 
                                            weight="quiet" 
                                            size="small"
                                            :disabled="loadingStates['move-' + anImport.getDescription()]"
                                            @click="handleMove(anImport)"
                                        >
                                            {{ loadingStates['move-' + anImport.getDescription()] ? '...' : SM_t('moveLinkText') }}
                                        </cdx-button>

                                        <cdx-button 
                                            action="destructive"
                                            weight="quiet" 
                                            size="small"
                                            :disabled="loadingStates['uninstall-' + anImport.getDescription()]"
                                            @click="handleUninstall(anImport)"
                                        >
                                            {{ loadingStates['uninstall-' + anImport.getDescription()] ? '...' : 
                                               (removedScripts.includes(anImport.getDescription()) ? SM_t('restoreLinkText') : SM_t('uninstallLinkText')) }}
                                        </cdx-button>
                                    </div>
                                </cdx-card>
                            </div>
                        </div>
                        </template>
                    </div>
                    
                    <div class="sm-dialog-module">
                        <div class="sm-bottom-left">
                            <!-- Empty left side for now -->
                        </div>
                        <div class="sm-dialog-actions">
                            <cdx-button 
                                weight="primary"
                                :disabled="Object.keys(filteredImports).length === 0 || selectedSkin === 'gadgets'"
                                @click="handleNormalizeAll"
                            >
                                {{ SM_t('normalize') }}
                            </cdx-button>
                        </div>
                    </div>
                </cdx-dialog>
            `
        });
        
        try {
            app = createApp(ScriptManager);
            var mountedApp = app.mount(rootEl);
            // keep internal reference for reactive updates from async loaders
            scriptInstallerVueComponent = mountedApp;
            smLog('createVuePanel: mounted');
        } catch (error) {
            smError('Error mounting Vue app:', error);
            container.html('<div class="error">Error creating Vue component: ' + error.message + '</div>');
        }
    }


    function buildCurrentPageInstallElement() {
        var addingInstallLink = false; // will we be adding a legitimate install link?
        var installElement = $( "<span>" ); // only used if addingInstallLink is set to true

        var namespaceNumber = mw.config.get( "wgNamespaceNumber" );
        var pageName = mw.config.get( "wgPageName" );

        // Namespace 2 is User
        if( namespaceNumber === SM_USER_NAMESPACE_NUMBER &&
                pageName.indexOf( "/" ) > 0 ) {
            var contentModel = mw.config.get( "wgPageContentModel" );
            var isCodeModel = (contentModel === "javascript" || contentModel === "css" || contentModel === "sanitized-css");
            if( isCodeModel ) {
                var prefixLength = mw.config.get( "wgUserName" ).length + USER_NAMESPACE_NAME.length + 1;
                if( pageName.indexOf( USER_NAMESPACE_NAME + ":" + mw.config.get( "wgUserName" ) ) === 0 ) {
                    var nameWithoutNs = pageName.substring( prefixLength );
                    var baseSkinName = nameWithoutNs.replace(/\.(?:js|css)$/i, '');
                    var skinIndex = SKINS.indexOf( baseSkinName );
                    if( skinIndex >= 0 ) {
                        return $( "<abbr>" ).text( SM_t('cannotInstall') )
                                .attr( "title", SM_t('cannotInstallSkin') );
                    }
                }
                addingInstallLink = true;
            } else {
                return $( "<abbr>" ).text( SM_t('cannotInstall') + " (" + SM_t('notJavaScript') + ")" )
                        .attr( "title", SM_t('cannotInstallContentModel').replace( "$1", contentModel ) );
            }
        }

        // Namespace 8 is MediaWiki
        if( namespaceNumber === SM_MEDIAWIKI_NAMESPACE_NUMBER ) {
            return $( "<a>" ).text( SM_t('installViaPreferences') )
                    .attr( "href", mw.util.getUrl( "Special:Preferences" ) + "#mw-prefsection-gadgets" );
        }

        var editRestriction = mw.config.get( "wgRestrictionEdit" ) || [];
        if( ( namespaceNumber !== SM_USER_NAMESPACE_NUMBER && namespaceNumber !== SM_MEDIAWIKI_NAMESPACE_NUMBER ) &&
            ( editRestriction.indexOf( "sysop" ) >= 0 ||
                editRestriction.indexOf( "editprotected" ) >= 0 ) ) {
            installElement.append( " ",
                $( "<abbr>" ).append(
                    $( "<img>" ).attr( "src", "https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Achtung-yellow.svg/20px-Achtung-yellow.svg.png" ).addClass( "warning" ),
                    SM_t('insecure') )
                .attr( "title", SM_t('tempWarning') ) );
            addingInstallLink = true;
        }

        if( addingInstallLink ) {
            var fixedPageName = mw.config.get( "wgPageName" ).replace( /_/g, " " );
            var installedTargets = getTargetsForScript(fixedPageName);
            installElement.prepend( $( "<a>" )
                    .attr( "id", "script-installer-main-install" )
                    .text( installedTargets.length ? SM_t('uninstallLinkText') : SM_t('installLinkText') )
                    .click( makeLocalInstallClickHandler( fixedPageName ) ) );

            // If the script is installed but disabled, allow the user to enable it
            var allScriptsInTarget = (importsRef && importsRef.value) ? importsRef.value[ installedTargets ] : imports[ installedTargets ];
            var importObj = allScriptsInTarget && allScriptsInTarget.find( function ( anImport ) { return anImport.page === fixedPageName; } );
            if( importObj && importObj.disabled ) {
                installElement.append( " | ",
                    $( "<a>" )
                        .attr( "id", "script-installer-main-enable" )
                        .text( SM_t('enableLinkText') )
                        .click( function () {
                            $( this ).text( SM_t('enableProgressMsg') );
                            importObj.setDisabled( false ).done( function () {
                                reloadAfterChange();
                            } );
                        } ) );
            }
            return installElement;
        }

        return $( "<abbr>" ).text( SM_t('cannotInstall') + " " + SM_t('insecure') )
                .attr( "title", SM_t('badPageError') );
    }

    function showUi() {
        if( !document.getElementById( "sm-top-container" ) ) {
            var fixedPageName = mw.config.get( "wgPageName" ).replace( /_/g, " " );
            try { var sub = document.getElementById('contentSub'); if (sub) sub.classList.add('sm-contentSub'); } catch(_) {}
            $( "#firstHeading" ).append( $( "<span>" )
                .attr( "id", "sm-top-container" )
                .append(
                    (function(){
                        var $btn = $( "<a>" )
                            .attr( "id", "sm-manage-button" )
                            .attr( "title", SM_t('manageUserScripts') )
                            .addClass( "sm-manage-button" )
                            .append(
                                $( '<span class="sm-gear-icon"></span>' ),
                            )
                            .click( function () {
                                var exists = !!document.getElementById( "sm-panel" );
                                smLog('showUi: Manage clicked; panel exists?', exists);
                                if( !exists ) {
                                    smLog('showUi: mount panel');
                                    $( "#mw-content-text" ).before( makePanel() );
                                } else {
                                    smLog('showUi: remove panel');
                                    $( "#sm-panel" ).remove();
                                }
                                try { $(this).toggleClass('open', !exists); } catch(_) {}
                             } );
                        // Defer icon rendering until inserted
                        (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : setTimeout)(function(){
                             try {
                                 var gear = document.querySelector('#sm-manage-button .sm-gear-icon');
                                 if (gear) smRenderIconInto(gear, 'cdxIconSettings', 'currentColor', 16);
                             } catch(e) { smLog('render icons failed', e); }
                         }, 0);
                        return $btn;
                    })()
                ) );

            function injectInstallIndicator(){
                try {
                    var $indRoot = $("#mw-indicators, .mw-indicators").first();
                    if (!$indRoot || !$indRoot.length) return false;
                    // Gate using existing logic: create element and ensure install anchor exists
                    var $installEl = buildCurrentPageInstallElement();
                    var canInstall = ($installEl && $installEl.find && $installEl.find('#script-installer-main-install').length);
                    if (!canInstall) return false;
                    var $slot = $("#mw-indicator-sm-install");
                    if (!$slot.length) { $slot = $('<div id="mw-indicator-sm-install" class="mw-indicator"></div>').appendTo($indRoot); }
                    $slot.empty();

                    // Mount a Codex button via helper for current page
                    var host = $('<div id="sm-install-indicator-host"></div>');
                    $slot.append(host);
                    var scriptName = fixedPageName; // current page
                    mountInstallButton(host[0], scriptName);
                    return true;
                } catch(e) { smLog('mw-indicators injection failed', e); return false; }
            }
            // Try now; then via hook; then via observer as fallback
            var ok = injectInstallIndicator();
            if (!ok) { setTimeout(injectInstallIndicator, 100); }
            try { if (mw && mw.hook && mw.hook('wikipage.content')) mw.hook('wikipage.content').add(function(){ setTimeout(injectInstallIndicator, 0); }); } catch(_) {}
        }
    }

    // Helper to mount Codex Install/Uninstall button into a host element for given scriptName
    function mountInstallButton(hostEl, scriptName) {
        try {
            var initialLabel = (getTargetsForScript(scriptName).length ? SM_t('uninstallLinkText') : SM_t('installLinkText'));
            loadVueCodex().then(function(libs){
                var app = libs.createApp({
                    data: function(){ return { label: initialLabel, busy: false }; },
                    computed: {
                        actionType: function(){ return this.label === SM_t('installLinkText') ? 'progressive' : 'destructive'; }
                    },
                    methods: {
                        onClick: function(){
                            var self=this;
                            smLog('install button click', { busy: !!self.busy, label: self.label, scriptName: scriptName });
                            if (self.busy) return; self.busy=true; smLog('install button set busy=true');
                            if (self.label === SM_t('installLinkText')) {
                                var adapter = {
                                    text: function(t){ try { self.label = String(t); smLog('adapter.text set label', t); } catch(e){} },
                                    resetBusy: function(){ try { self.busy = false; smLog('adapter.resetBusy executed'); } catch(e){} }
                                };
                                try { smLog('opening install dialog for', scriptName); showInstallDialog(scriptName, adapter); } catch(e) { self.busy=false; smLog('showInstallDialog error', e); }
                            } else {
                                self.label = SM_t('uninstallProgressMsg'); smLog('uninstall start', { scriptName: scriptName });
                                var targets = getTargetsForScript(scriptName);
                                var uninstalls = uniques(targets).map(function(target){ return Import.ofLocal(scriptName, target).uninstall(); });
                                $.when.apply($, uninstalls).then(function(){
                                    self.label = SM_t('installLinkText'); smLog('uninstall done; reloading');
                                    reloadAfterChange();
                                }).always(function(){ self.busy=false; });
                            }
                        }
                    },
                    template: '<CdxButton :action="actionType" weight="primary" :disabled="busy" @click="onClick">{{ label }}</CdxButton>'
                });
                app.component('CdxButton', libs.CdxButton);
                app.mount(hostEl);
            });
        } catch(e) { smLog('mountInstallButton error', e); }
    }

    function attachInstallLinks() {
        // At the end of each {{Userscript}} transclusion, there is
        // <span id='User:Foo/Bar.js' class='scriptInstallerLink'></span>
        $( "span.scriptInstallerLink" ).each( function () {
            var scriptName = this.id;
            if( $( this ).find( "a" ).length === 0 ) {
                var installedTargets = getTargetsForScript(scriptName);
                $( this ).append( " | ", $( "<a>" )
                        .text( installedTargets.length ? SM_t('uninstallLinkText') : SM_t('installLinkText') )
                        .click( makeLocalInstallClickHandler( scriptName ) ) );
            }
        } );

        $( "table.infobox-user-script" ).each( function () {
            if( $( this ).find( ".sm-ibx" ).length === 0 ) {
                var scriptName = $( this ).find( "th:contains('Source')" ).next().text() ||
                        mw.config.get( "wgPageName" );
                scriptName = /user:.+?\/.+?.js/i.exec( scriptName )[0];
                var td = $( this ).children( "tbody" ).append( $( "<tr>" ).append( $( "<td>" )
                        .attr( "colspan", "2" )
                        .addClass( "sm-ibx" ) ) )
                    .find('td.sm-ibx');
                var host = $( '<div class="sm-ibx-host"></div>' );
                td.append( host );
                mountInstallButton(host[0], scriptName);
            }
        } );
    }

    function makeLocalInstallClickHandler( scriptName ) {
        return function () {
            var $this = $( this );
            if( $this.text() === SM_t('installLinkText') ) {
                // Show install dialog instead of confirm
                showInstallDialog( scriptName, $this );
            } else {
                $( this ).text( SM_t('uninstallProgressMsg') )
                var targets = getTargetsForScript(scriptName);
                var uninstalls = uniques( targets )
                        .map( function ( target ) { return Import.ofLocal( scriptName, target ).uninstall(); } )
                $.when.apply( $, uninstalls ).then( function () {
                    $( this ).text( SM_t('installLinkText') );
                    reloadAfterChange();
                }.bind( this ) );
            }
         };
    }

    function showInstallDialog( scriptName, buttonElement ) {
        // Create container for install dialog
        var container = $( "<div>" ).attr( "id", "sm-install-dialog" );
        
        // Load Vue and Codex for install dialog
        var open = function(){
            // Fail-safe: if dialog node disappears, make sure to reset busy on the opener
            var mo = null;
            try {
                mo = new MutationObserver(function(){
                    try {
                        if (!document.getElementById('sm-install-dialog')) {
                            if (buttonElement && typeof buttonElement.resetBusy === 'function') { buttonElement.resetBusy(); smLog('observer: resetBusy after dialog removal'); }
                            if (mo) mo.disconnect();
                        }
                    } catch(_) {}
                });
                mo.observe(document.body, { childList: true, subtree: true });
            } catch(_) {}

            loadVueCodex().then(function(libs) {
            smLog('showInstallDialog: libs loaded');
            if (!libs.createApp || !libs.CdxDialog || !libs.CdxButton || !libs.CdxSelect || !libs.CdxField) {
                throw new Error('Codex/Vue components not available for install dialog');
            }
            createInstallDialog(container, libs.createApp, libs.defineComponent, libs.ref, libs.CdxDialog, libs.CdxButton, libs.CdxSelect, libs.CdxField, scriptName, buttonElement);
        }).catch(function(error) {
            smLog('Failed to load Vue/Codex for install dialog:', error);
            // Fallback to old confirm dialog
            var okay = window.confirm(
                SM_t('bigSecurityWarning').replace( '$1',
                    SM_t('securityWarningSection').replace( '$1', scriptName ) ) );
            if( okay ) {
                buttonElement.text( SM_t('installProgressMsg') )
                Import.ofLocal( scriptName, window.SM_DEFAULT_SKIN ).install().done( function () {
                    buttonElement.text( SM_t('uninstallLinkText') );
                    reloadAfterChange();
                }.bind( buttonElement ) );
            }
        }); };
        try { if (typeof SM_waitI18n === 'function') { SM_waitI18n(open); } else { open(); } } catch(_) { open(); }
        
        // Add to body
        $('body').append(container);
    }

    function createInstallDialog(container, createApp, defineComponent, ref, CdxDialog, CdxButton, CdxSelect, CdxField, scriptName, buttonElement) {
        var InstallDialog = defineComponent({
            components: { CdxDialog, CdxButton, CdxSelect, CdxField },
            setup() {
                var dialogOpen = ref(true);
                var selectedSkin = ref('common');
                var isInstalling = ref(false);
                
                // Create skin options
                var skinOptions = SKINS.map(function(skin) {
                    var label = skin === 'common' ? (typeof t === 'function' ? t('skinCommon') : SM_t('skinCommon')) : skin;
                    return { label: label, value: skin };
                });
                
                var handleInstall = function() {
                    isInstalling.value = true;
                    buttonElement.text(SM_t('installProgressMsg'));
                    
                    Import.ofLocal(scriptName, selectedSkin.value).install().done(function() {
                        buttonElement.text(SM_t('uninstallLinkText'));
                        dialogOpen.value = false;
                        try { safeUnmount(app, container[0]); } catch(e) {}
                        reloadAfterChange();
                    }).fail(function(error) {
                        smLog('Failed to install script:', error);
                        showNotification('notificationInstallError', 'error', scriptName);
                        buttonElement.text(SM_t('installLinkText'));
                    }).always(function() {
                        isInstalling.value = false;
                    });
                };
                
                var handleCancel = function() {
                    dialogOpen.value = false;
                    try { safeUnmount(app, container[0]); } catch(e) {}
                    try { if (buttonElement && typeof buttonElement.resetBusy === 'function') buttonElement.resetBusy(); } catch(_) {}
                };
                var handleOpenUpdate = function(v){
                    smLog('install dialog update:open ->', v);
                    dialogOpen.value = v;
                    if (v === false) { try { handleCancel(); } catch(e) { smLog('handleOpenUpdate cancel error', e); } }
                };
                
                return {
                    dialogOpen,
                    selectedSkin,
                    isInstalling,
                    skinOptions,
                    handleInstall,
                    handleCancel,
                    handleOpenUpdate,
                    SM_t: t,
                    scriptName: scriptName
                };
            },
            template: `
                <cdx-dialog
                    v-model:open="dialogOpen"
                    :title="SM_t('installDialogTitle').replace ? SM_t('installDialogTitle').replace('$1', scriptName) : ('Install ' + scriptName)"
                    :use-close-button="true"
                    :default-action="{ label: SM_t('cancel') }"
                    :primary-action="{ label: isInstalling ? SM_t('installProgressMsg') : SM_t('installLinkText'), actionType: 'progressive', disabled: isInstalling }"
                    @default="handleCancel"
                    @close="handleCancel"
                    @update:open="handleOpenUpdate"
                    @primary="handleInstall"
                >
                    <p>{{ SM_t('bigSecurityWarning').replace('$1', SM_t('securityWarningSection').replace('$1', scriptName)) }}</p>
                    
                    <cdx-field>
                        <template #label>{{ SM_t('moveToSkin') }}</template>
                        <cdx-select
                            v-model:selected="selectedSkin"
                            :menu-items="skinOptions"
                            :default-label="SM_t('selectTargetSkin')"
                        />
                    </cdx-field>
                </cdx-dialog>
            `
        });
        
        try {
            app = mountVueApp(createApp, InstallDialog, container[0]);
            smLog('InstallDialog: mounted');
        } catch (error) {
            smLog('Error mounting install dialog:', error);
            container.remove();
        }
    }

    function showMoveDialog(anImport) {
        // Create container for move dialog
        var container = $( "<div>" ).attr( "id", "sm-move-dialog" );
        
        // Load Vue and Codex for move dialog
        loadVueCodex().then(function(libs) {
            smLog('showMoveDialog: libs loaded');
            if (!libs.createApp || !libs.CdxDialog || !libs.CdxButton || !libs.CdxSelect || !libs.CdxField) {
                throw new Error('Codex/Vue components not available for move dialog');
            }
            createMoveDialog(container, libs.createApp, libs.defineComponent, libs.ref, libs.CdxDialog, libs.CdxButton, libs.CdxSelect, libs.CdxField, anImport);
        }).catch(function(error) {
            smLog('Failed to load Vue/Codex for move dialog:', error);
            // Fallback to old prompt dialog
            var dest = null;
            var PROMPT = SM_t('movePrompt') + " " + SKINS.join(", ");
            do {
                dest = (window.prompt(PROMPT) || "").toLowerCase();
            } while (dest && SKINS.indexOf(dest) < 0);
            if (!dest) return;
            
            var key = 'move-' + anImport.getDescription();
            setLoading(key, true);
            anImport.move(dest).done(function() {
                // Reload data without closing dialog
                buildImportList().then(function() {
                    if (importsRef) {
                        importsRef.value = imports;
                    }
                });
            }).fail(function(error) {
                smLog('Failed to move script:', error);
                showNotification('notificationMoveError', 'error', anImport.getDescription());
            }).always(function() {
                setLoading(key, false);
            });
        });
        
        // Add to body
        $('body').append(container);
    }

    function createMoveDialog(container, createApp, defineComponent, ref, CdxDialog, CdxButton, CdxSelect, CdxField, anImport) {
        var app;
        var MoveDialog = defineComponent({
            components: { CdxDialog, CdxButton, CdxSelect, CdxField },
            setup() {
                var dialogOpen = ref(true);
                var selectedTarget = ref('common');
                var isMoving = ref(false);
                
                // Create target options (exclude current target)
                var targetOptions = SKINS.filter(function(skin) {
                    return skin !== anImport.target;
                }).map(function(skin) {
                    return {
                        label: skin === 'global' ? SM_t('globalAppliesToAllWikis') : skin,
                        value: skin
                    };
                });
                
                smLog('Move dialog - current target:', anImport.target);
                smLog('Move dialog - target options:', targetOptions);
                
                var handleMove = function() {
                    if (isMoving.value) return;
                    
                    isMoving.value = true;
                    
                    smLog('Moving script:', anImport.getDescription());
                    smLog('From target:', anImport.target);
                    smLog('To target:', selectedTarget.value);
                    
                    anImport.move(selectedTarget.value).done(function() {
                        smLog('Move successful');
                        // Reload data without closing dialog
                        buildImportList().then(function() {
                            if (importsRef) {
                                importsRef.value = imports;
                            }
                        });
                        dialogOpen.value = false;
                        try { safeUnmount(app, container[0]); } catch(e) {}
                    }).fail(function(error) {
                        smError('Failed to move script:', error);
                        showNotification('notificationMoveError', 'error', anImport.getDescription());
                    }).always(function() {
                        isMoving.value = false;
                    });
                };
                
                var handleClose = function() {
                    dialogOpen.value = false;
                    try { safeUnmount(app, container[0]); } catch(e) {}
                };
                
                return {
                    dialogOpen,
                    selectedTarget,
                    isMoving,
                    targetOptions,
                    handleMove,
                    handleClose,
                    scriptName: anImport.getDescription(),
                    currentTarget: anImport.target,
                    SM_t: t
                };
            },
            template: `
                <CdxDialog
                    v-model:open="dialogOpen"
                    :title="SM_t('moveDialogTitle').replace('$1', scriptName)"
                    :use-close-button="true"
                    @close="handleClose"
                >
                    <div class="sm-move-content">
                        <p><strong>{{ SM_t('currentLocation') }}</strong> {{ currentTarget === 'global' ? SM_t('globalAppliesToAllWikis') : currentTarget }}</p>
                        
                        <CdxField>
                            <template #label>{{ SM_t('moveToSkin') }}</template>
                            <CdxSelect
                                v-model:selected="selectedTarget"
                                :menu-items="targetOptions"
                                :disabled="isMoving"
                                :default-label="SM_t('selectTargetSkin')"
                            />
                        </CdxField>
                        
                        <div class="sm-move-actions">
                            <CdxButton
                                @click="handleMove"
                                :disabled="isMoving"
                                action="progressive"
                            >
                                {{ isMoving ? SM_t('movingProgress') : SM_t('moveScriptButton') }}
                            </CdxButton>
                        </div>
                    </div>
                </CdxDialog>
            `
        });
        
        try {
            app = mountVueApp(createApp, MoveDialog, container[0]);
        } catch (error) {
            smLog('Error mounting move dialog:', error);
            container.remove();
        }
    }

    /********************************************
     *
     * Utility functions
     *
     ********************************************/

    /**
     * Gets the wikitext of a page with the given title (namespace required).
     */
    function getWikitext( title ) {
        return getApiForTitle( title ).get({
                action: "query",
                prop: "revisions",
                rvprop: "content",
                rvslots: "main",
                rvlimit: 1,
                titles: title
        }).then( function ( data ) {
            var pageId = Object.keys( data.query.pages )[0];
            if( data.query.pages[pageId].revisions ) {
                return data.query.pages[pageId].revisions[0].slots.main["*"];
            }
            return "";
        } );
    }

    function escapeForRegex( s ) {
        return s.replace( /[-\/\\^$*+?.()|[\]{}]/g, '\\$&' );
    }

    /**
    * Escape a string for use in a JavaScript string literal.
    * This function is adapted from
    * https://github.com/joliss/js-string-escape/blob/6887a69003555edf5c6caaa75f2592228558c595/index.js
    * (released under the MIT licence).
    */
    function escapeForJsString( s ) {
        return s.replace( /["'\\\n\r\u2028\u2029]/g, function ( character ) {
            // Escape all characters not included in SingleStringCharacters and
            // DoubleStringCharacters on
            // http://www.ecma-international.org/ecma-262/5.1/#sec-7.8.4
            switch ( character ) {
                case '"':
                case "'":
                case '\\':
                    return '\\' + character;
                // Four possible LineTerminator characters need to be escaped:
                case '\n':
                    return '\\n';
                case '\r':
                    return '\\r';
                case '\u2028':
                    return '\\u2028';
                case '\u2029':
                    return '\\u2029';
            }
        } );
    }

    /**
    * Escape a string for use in an inline JavaScript comment (comments that
    * start with two slashes "//").
    * This function is adapted from
    * https://github.com/joliss/js-string-escape/blob/6887a69003555edf5c6caaa75f2592228558c595/index.js
    * (released under the MIT licence).
    */
    function escapeForJsComment( s ) {
        return s.replace( /[\n\r\u2028\u2029]/g, function ( character ) {
            switch ( character ) {
                // Escape possible LineTerminator characters
                case '\n':
                    return '\\n';
                case '\r':
                    return '\\r';
                case '\u2028':
                    return '\\u2028';
                case '\u2029':
                    return '\\u2029';
            }
        } );
    }

    /**
    * Unescape a JavaScript string literal.
    *
    * This is the inverse of escapeForJsString.
    */
    function unescapeForJsString( s ) {
        return s.replace( /\\"|\\'|\\\\|\\n|\\r|\\u2028|\\u2029/g, function ( substring ) {
            switch ( substring ) {
                case '\\"':
                    return '"';
                case "\\'":
                    return "'";
                case "\\\\":
                    return "\\";
                case "\\r":
                    return "\r";
                case "\\n":
                    return "\n";
                case "\\u2028":
                    return "\u2028";
                case "\\u2029":
                    return "\u2029";
            }
        } );
    }

    function getFullTarget ( target ) {
        // CSS installs are still supported via page value ending with .css.
        if ( target === "global" ) {
            return "User:" + mw.config.get( "wgUserName" ) + "/global.js";
        }
        return USER_NAMESPACE_NAME + ":" + mw.config.get( "wgUserName" ) + "/" + 
                target + ".js";
    }

    function getApiForTarget( target ) {
        return target === 'global' ? metaApi : api;
    }

    function getApiForTitle( title ) {
        return title.indexOf( "/global.js" ) !== -1 ? metaApi : api;
    }

    function getSummaryForTarget( target, summaryKey, description ) {
        if ( target === 'global' ) {
            // Use English summary for global.js from en.json
            return STRINGS_EN[summaryKey].replace( "$1", description ) + (SUMMARY_TAG ? " " + SUMMARY_TAG : "");
        } else {
            // Use localized summary for local scripts
            return STRINGS[summaryKey].replace( "$1", description ) + (SUMMARY_TAG ? " " + SUMMARY_TAG : "");
        }
    }

    // From https://stackoverflow.com/a/10192255
    function uniques( array ){
        return array.filter( function( el, index, arr ) {
            return index === arr.indexOf( el );
        });
    }

    // scriptInstallerAutoReload removed: always reload explicitly via reloadAfterChange()

    // Initialize default target: prefer new var, fallback to legacy, default to "common"
    if (!window.SM_DEFAULT_SKIN || typeof window.SM_DEFAULT_SKIN !== 'string') {
        if (typeof window.scriptInstallerInstallTarget === 'string' && window.scriptInstallerInstallTarget) {
            window.SM_DEFAULT_SKIN = window.scriptInstallerInstallTarget;
        } else {
            window.SM_DEFAULT_SKIN = "common"; // by default, install things to the user's common.js
        }
    }
    // Keep legacy alias in sync for any external consumers
    try { window.scriptInstallerInstallTarget = window.SM_DEFAULT_SKIN; } catch(_) {}

    // SUMMARY_TAG: internal constant
    // SUMMARY_TAG already initialized above

    var jsPage = (function(){
        try {
            var pn = mw.config.get( "wgPageName" ) || '';
            var cm = mw.config.get( "wgPageContentModel" ) || '';
            return /\.js$/i.test(pn) || /\.css$/i.test(pn) || /javascript|css|sanitized-css/i.test(cm);
        } catch(_) { return true; }
    })();

    // Load languageFallbacks.json from GitLab via CORS proxy
    var languageFallbacks = {};
    fetch('https://gitlab-content.toolforge.org/iniquity/script-manager/-/raw/main/data/languageFallbacks.json?mime=application/json')
      .then(resp => resp.json())
      .then(fallbacks => { languageFallbacks = fallbacks; })
      .catch(() => { languageFallbacks = {}; });

    function getLanguageChain(lang) {
      const chain = [lang];
      let current = lang;
      const visited = new Set([lang]);
      while (languageFallbacks[current]) {
        for (const fallback of languageFallbacks[current]) {
          if (!visited.has(fallback)) {
            chain.push(fallback);
            visited.add(fallback);
            current = fallback;
            break;
          }
        }
        if (chain[chain.length - 1] === current) break;
      }
      if (!chain.includes('en')) chain.push('en');
      return chain;
    }

    // i18n helpers
    function t(key){
        try {
            if (STRINGS && Object.prototype.hasOwnProperty.call(STRINGS, key)) return STRINGS[key];
            if (STRINGS_EN && Object.prototype.hasOwnProperty.call(STRINGS_EN, key)) { smWarn('Missing i18n key in current language:', key); return STRINGS_EN[key]; }
            smWarn('Missing i18n key in all languages:', key); return key;
        } catch(e){ return key; }
    }
    // Local alias for templates via app.config.globalProperties.SM_t
    var SM_t = t;

    function loadI18nWithFallback(lang, callback) {
      const chain = getLanguageChain(lang);
      let idx = 0;
      let loadedCount = 0;
      
      function tryNext() {
        if (idx >= chain.length) {
          smLog('No localization found for any fallback language');
          return;
        }
        const tryLang = chain[idx++];
        const url = `https://gitlab-content.toolforge.org/iniquity/script-manager/-/raw/main/i18n/${tryLang}.json?mime=application/json`;
        fetch(url)
          .then(resp => resp.ok ? resp.json() : Promise.reject('HTTP ' + resp.status))
          .then(i18n => {
            if (tryLang === 'en') {
              STRINGS_EN = i18n;
              // Only set STRINGS to English if no other language was loaded
              if (loadedCount === 0) {
                STRINGS = i18n;
              }
            } else {
              STRINGS = i18n;
            }
            loadedCount++;
            if (loadedCount >= 2 || (loadedCount === 1 && !chain.includes('en')) || (loadedCount === 1 && tryLang === 'en')) {
            if (callback) callback();
            }
          })
          .catch(err => {
            smLog('Failed to load i18n for', tryLang, ':', err);
            tryNext();
          });
      }
      
      // Load both current language and English
      tryNext();
      if (lang !== 'en') {
        idx = chain.indexOf('en');
        if (idx === -1) idx = chain.length;
      tryNext();
      }
    }

    // Prewarm Codex bundles early to speed up first open of the modal (optional)
    try { 
        var SHOULD_PREWARM = !!window.SM_PREWARM_CODEX;
        // Heuristic: prewarm if page likely relevant (user JS page, has scriptInstallerLink, or is user namespace)
        try {
            var ns = mw.config && mw.config.get ? mw.config.get('wgNamespaceNumber') : null;
            if (!SHOULD_PREWARM && (document.getElementsByClassName('scriptInstallerLink').length > 0 || ns === 2)) SHOULD_PREWARM = true;
        } catch(_) {}
        if (SHOULD_PREWARM && mw && mw.loader && typeof mw.loader.load === 'function') { 
            mw.loader.load(['vue', '@wikimedia/codex']); 
            smLog('prewarm: requested vue+codex');
        } 
    } catch(e) {}

    // Using:
    // I18N readiness signaling for lazy openers
    var SM_I18N_DONE = false;
    var __SM_i18nCbs = [];
    function SM_waitI18n(cb){ try { if (SM_I18N_DONE) { cb(); } else { __SM_i18nCbs.push(cb); } } catch(_){} }

    var userLang = mw.config.get('wgUserLanguage') || 'en';
    loadI18nWithFallback(userLang, function() {
      SM_I18N_DONE = true; try { (__SM_i18nCbs||[]).splice(0).forEach(function(cb){ try{ cb(); }catch(_){} }); } catch(_) {}
      $.when(
        $.ready,
        mw.loader.using(["mediawiki.api", "mediawiki.ForeignApi", "mediawiki.util"])
      ).then(function () {
        api = new mw.Api();
        metaApi = new mw.ForeignApi( 'https://meta.wikimedia.org/w/api.php' );
        
        // Load both scripts and gadgets
        $.when(
          buildImportList(),
          loadGadgets(),
          loadUserGadgetSettings()
        ).then(function (imports, gadgets, userSettings) {
          // Load section order, labels and gadgets label after gadgets are loaded
          return Promise.all([
            loadSectionOrder(),
            loadSectionLabels(),
            loadGadgetsLabel()
          ]).then(function(results) {
            var sectionOrder = results[0];
            var sectionLabels = results[1];
            var gadgetsLabel = results[2];
            
            // Store data internally and update Vue component reactively
            gadgetSectionOrderVar = sectionOrder;
            applyGadgetLabels(sectionLabels, gadgetsLabel);
            
            return { imports: imports, gadgets: gadgets, userSettings: userSettings, sectionOrder: sectionOrder, sectionLabels: sectionLabels, gadgetsLabel: gadgetsLabel };
          });
        }).then(function(data) {
          attachInstallLinks();
          if (jsPage) showUi();
          // auto-open via cookie removed
        });
      });
    });
    // Public opener for lazy init loaders
    try {
        function SM_openScriptManager(){
            var doOpen = function(){
                try {
                    var exists = !!document.getElementById('sm-panel');
                    if (!exists) {
                        $("#mw-content-text").before( makePanel() );
                    } else {
                        $("#sm-panel").remove();
                    }
                } catch(e) { smLog('SM_openScriptManager error', e); }
            };
            try { if (typeof SM_waitI18n === 'function') { SM_waitI18n(doOpen); } else { doOpen(); } } catch(_) { doOpen(); }
        }
    } catch(e) {}
} )();