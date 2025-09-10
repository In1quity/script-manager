/* Adapted version of [[User:Enterprisey/script-installer|script-installer]] 
 * 
 * Configuration:
 * - window.scriptInstallerInstallTarget: Set default skin for new installations (e.g., "common", "global", "vector")
 * - window.scriptInstallerAutoReload: Set to false to disable auto-reload after changes
 * - window.ADVERT: Custom suffix for edit summaries
 */

( function () {
    // ============================================================================
    // Configuration and constants
    // ============================================================================
    
    // MediaWiki API instances
    var api; // Local wiki API instance
    var metaApi; // Foreign API for global.js (meta.wikimedia.org)
    
    // Skin configuration - keep "common" at beginning for UI order
    var SKINS = [ "common", "global", "monobook", "minerva", "vector", "vector-2022", "timeless" ];
    
    // UI thresholds
    var NUM_SCRIPTS_FOR_SEARCH = 5; // How many scripts before showing quick filter
    
    // ============================================================================
    // Data storage
    // ============================================================================
    
    // Script management data
    var imports = {}; // Master import list, keyed by target (e.g., "common", "vector")
    var localScriptsByName = {}; // Local scripts, keyed by name; value is target array
    var scriptCount = 0; // Total number of installed scripts
    var importsRef = null; // Reactive reference for Vue component
    
    // Gadgets data
    var gadgetsData = {}; // Gadgets data from MediaWiki API
    var userGadgetSettings = {}; // User's gadget preferences from options
    
    // ============================================================================
    // Localization and configuration
    // ============================================================================
    
    var STRINGS = {}; // Localized strings for current language
    var STRINGS_EN = {}; // English strings fallback
    var ADVERT = ""; // Suffix for edit summaries
    var USER_NAMESPACE_NAME = mw.config.get( "wgFormattedNamespaces" )[2]; // User namespace name
    
    // ============================================================================
    // Global configuration and state
    // ============================================================================
    
    // Global configuration flags (set via window properties)
    var scriptInstallerAutoReload = true; // Whether to auto-reload after changes
    var scriptInstallerInstallTarget = "common"; // Default target for new installations (internal reference)
    
    // Global data for Vue components
    var gadgetSectionOrder = []; // Order of gadget sections from MediaWiki:Gadgets-definition
    var gadgetSectionLabels = {}; // Localized labels for gadget sections
    var gadgetsLabel = "Gadgets"; // Localized label for gadgets tab
    
    // ============================================================================
    // Constants (SM_ prefix for global constants only, following maintenance-core.js pattern)
    // ============================================================================
    
    var SM_DEBUG_PREFIX = '[SM]'; // Debug log prefix
    var SM_NOTIFICATION_DISPLAY_TIME = 4000; // Notification display time in ms
    var SM_NOTIFICATION_CLEANUP_DELAY = 4200; // Notification cleanup delay in ms
    var SM_USER_NAMESPACE_NUMBER = 2; // MediaWiki User namespace number
    var SM_MEDIAWIKI_NAMESPACE_NUMBER = 8; // MediaWiki namespace number
    // Note: User namespace prefix length varies by language, so we calculate it dynamically
    
    // ============================================================================
    // Utility functions (following maintenance-core.js pattern)
    // ============================================================================
    
    function smLog() { 
        if (window.scriptInstallerDebug) { 
            try { 
                console.log.apply(console, [SM_DEBUG_PREFIX].concat([].slice.call(arguments))); 
            } catch (e) {} 
        } 
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

        var LOADER_RGX = /^\s*(\/\/)?\s*mw\.loader\.load\s*\(\s*(?:"|')(.+?)(?:"|')\s*\)/;
        if( match = LOADER_RGX.exec( line ) ) {
            return Import.ofUrl( unescapeForJsString( match[2] ), target, !!match[1] );
        }
    }

    Import.prototype.getDescription = function ( useWikitext ) {
        switch( this.type ) {
            case 0: return useWikitext ? ( "[[" + this.page + "]]" ) : this.page;
            case 1: return STRINGS.remoteUrlDesc.replace( "$1", this.page ).replace( "$2", this.wiki );
            case 2: return this.url;
        }
    }

    /**
     * Human-readable (NOT necessarily suitable for ResourceLoader) URL.
     */
    Import.prototype.getHumanUrl = function () {
        switch( this.type ) {
            case 0: return "/wiki/" + encodeURI( this.page );
            case 1: return "//" + this.wiki + ".org/wiki/" + encodeURI( this.page );
            case 2: return this.url;
        }
    }

    Import.prototype.toJs = function () {
        var dis = this.disabled ? "//" : "";
        
        switch( this.type ) {
            case 0: 
                // Local scripts
                if (this.target === 'global') {
                    // For global.js, use mw.loader.load and English backlink
                    var globalUrl = "//" + mw.config.get('wgServerName') + "/w/index.php?title=" + 
                                   encodeURIComponent( this.page ) + "&action=raw&ctype=text/javascript";
                    return dis + "mw.loader.load('" + escapeForJsString( globalUrl ) + "'); // " + STRINGS_EN.backlink + " [[" + escapeForJsComment( this.page ) + "]]";
                } else {
                    return dis + "importScript('" + escapeForJsString( this.page ) + "'); // " + STRINGS.backlink + " [[" + escapeForJsComment( this.page ) + "]]";
                }
                
            case 1: 
                // Remote scripts - convert to URL format
                var remoteUrl = "//" + encodeURIComponent( this.wiki ) + ".org/w/index.php?title=" +
                               encodeURIComponent( this.page ) + "&action=raw&ctype=text/javascript";
                return dis + "mw.loader.load('" + escapeForJsString( remoteUrl ) + "');";
                
            case 2: 
                // Direct URL scripts
                return dis + "mw.loader.load('" + escapeForJsString( this.url ) + "');";
                
            default:
                return "";
        }
    }

    /**
     * Installs the import.
     */
    Import.prototype.install = function () {
        var targetApi = getApiForTarget( this.target );
        return targetApi.postWithEditToken( {
            action: "edit",
            title: getFullTarget( this.target ),
            summary: getSummaryForTarget( this.target, 'installSummary', this.getDescription( /* useWikitext */ true ) ),
            appendtext: "\n" + this.toJs()
        } ).then(function() {
            showNotification('notificationInstallSuccess', 'success', this.getDescription());
        }.bind(this)).catch(function(error) {
            console.error('Install failed:', error);
            showNotification('notificationInstallError', 'error', this.getDescription());
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
    Import.prototype.uninstall = function () {
        var that = this;
        return getWikitext( getFullTarget( this.target ) ).then( function ( wikitext ) {
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
        } ).then(function() {
            showNotification('notificationUninstallSuccess', 'success', that.getDescription());
        }).catch(function(error) {
            console.error('Uninstall failed:', error);
            showNotification('notificationUninstallError', 'error', that.getDescription());
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
            console.error('Set disabled failed:', error);
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
        smLog('Import.move - calling uninstall and install');
        return $.when( old.uninstall(), this.install() ).then(function() {
            showNotification('notificationMoveSuccess', 'success', that.getDescription());
        }).catch(function(error) {
            console.error('Move failed:', error);
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
            prefixLength = mw.config.get( "wgUserName" ).length + USER_NAMESPACE_NAME.length + 1; // +1 for ":"
            
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
                    prefixLength = mw.config.get( "wgUserName" ).length + USER_NAMESPACE_NAME.length + 1; // +1 for ":"
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

    function buildImportList() {
        return getAllTargetWikitexts().then( function ( wikitexts ) {
            Object.keys( wikitexts ).forEach( function ( targetName ) {
                var targetImports = [];
                if( wikitexts[ targetName ] ) {
                    var lines = wikitexts[ targetName ].split( "\n" );
                    var currImport;
                    for( var i = 0; i < lines.length; i++ ) {
                        if( currImport = Import.fromJs( lines[i], targetName ) ) {
                            targetImports.push( currImport );
                            scriptCount++;
                            if( currImport.type === 0 ) {
                                if( !localScriptsByName[ currImport.page ] )
                                    localScriptsByName[ currImport.page ] = [];
                                localScriptsByName[ currImport.page ].push( currImport.target );
                            }
                        }
                    }
                }
                imports[ targetName ] = targetImports;
            } );
            
            // Update reactive reference if it exists
            if (importsRef) {
                importsRef.value = imports;
            }
        } );
    }

    function loadGadgets() {
        return api.get({
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
                        description: gadget.desc || STRINGS.noDescriptionAvailable,
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
            console.error('Failed to load gadgets:', error);
            gadgetsData = {};
            return gadgetsData;
        });
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
        smLog('Loading gadgets label from system messages');
        return api.get({
            action: 'query',
            meta: 'allmessages',
            ammessages: 'prefs-gadgets',
            format: 'json'
        }).then(function(msgData) {
            smLog('System message response:', msgData);
            if (msgData.query && msgData.query.allmessages && msgData.query.allmessages[0] && msgData.query.allmessages[0]['*']) {
                var label = msgData.query.allmessages[0]['*'];
                smLog('Loaded gadgets label from system message:', label);
                return label;
            } else {
                smLog('No system message found, using fallback');
                return 'Gadgets'; // Fallback
            }
        }).catch(function() {
            smLog('Error loading system message, using fallback');
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

    function loadUserGadgetSettings() {
        return api.get({
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
            console.error('Failed to load user gadget settings:', error);
            userGadgetSettings = {};
            return {};
        });
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
            console.error('Failed to toggle gadget:', error);
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
                summary: STRINGS.normalizeSummary,
                text: newLines.join( "\n" )
            } );
        } ).then(function() {
            showNotification('notificationNormalizeSuccess', 'success');
        }).catch(function(error) {
            console.error('Normalize failed:', error);
            showNotification('notificationNormalizeError', 'error');
        });
    }

    function conditionalReload( openPanel ) {
        if( scriptInstallerAutoReload ) {
            if( openPanel ) document.cookie = "open_script_installer=yes";
            window.location.reload( true );
        }
    }

    /********************************************
     *
     * Notification system
     *
     ********************************************/
    function getMessageStack() {
        var stack = document.getElementById('script-installer-message-stack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'script-installer-message-stack';
            stack.className = 'script-installer-message-stack';
            document.body.appendChild(stack);
        }
        return stack;
    }

    function showNotification(messageKeyOrText, type, param) {
        var message;
        if (typeof messageKeyOrText === 'string' && STRINGS[messageKeyOrText]) {
            // Use localized message with optional parameter
            if (param !== undefined) {
                message = STRINGS[messageKeyOrText].replace('$1', param);
            } else {
                message = STRINGS[messageKeyOrText];
            }
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
                host.className = 'script-installer-message-host';
                stack.appendChild(host);
                
                var app = createApp({
                    data: function(){ 
                        return { 
                            type: status, 
                            message: message, 
                            show: true 
                        }; 
                    },
                    template: '<transition name="script-installer-fade"><CdxMessage v-if="show" :type="type" :fade-in="true" :allow-user-dismiss="true" :auto-dismiss="true" :display-time="' + SM_NOTIFICATION_DISPLAY_TIME + '"><div v-html="message"></div></CdxMessage></transition>'
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
                console.error('showNotification error:', e); 
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
        var container = $( "<div>" ).attr( "id", "script-installer-panel" );
        
        // Load Vue and Codex
        mw.loader.using(['vue', '@wikimedia/codex']).then(function() {
            // Create Vue panel
            var VueMod = mw.loader.require('vue');
            var CodexPkg = mw.loader.require('@wikimedia/codex');
            
            var createApp = VueMod.createApp || VueMod.createMwApp;
            var defineComponent = VueMod.defineComponent;
            var ref = VueMod.ref;
            var computed = VueMod.computed;
            
            var CdxDialog = CodexPkg.CdxDialog || (CodexPkg.components && CodexPkg.components.CdxDialog);
            var CdxButton = CodexPkg.CdxButton || (CodexPkg.components && CodexPkg.components.CdxButton);
            var CdxTextInput = CodexPkg.CdxTextInput || (CodexPkg.components && CodexPkg.components.CdxTextInput);
            var CdxSelect = CodexPkg.CdxSelect || (CodexPkg.components && CodexPkg.components.CdxSelect);
            var CdxField = CodexPkg.CdxField || (CodexPkg.components && CodexPkg.components.CdxField);
            var CdxTabs = CodexPkg.CdxTabs || (CodexPkg.components && CodexPkg.components.CdxTabs);
            var CdxTab = CodexPkg.CdxTab || (CodexPkg.components && CodexPkg.components.CdxTab);
            var CdxToggleButton = CodexPkg.CdxToggleButton || (CodexPkg.components && CodexPkg.components.CdxToggleButton);
            
            if (!createApp || !CdxDialog || !CdxButton || !CdxTextInput || !CdxSelect || !CdxField || !CdxTabs || !CdxTab || !CdxToggleButton) {
                throw new Error('Codex/Vue components not available');
            }
            
            createVuePanel(container, createApp, defineComponent, ref, computed, CdxDialog, CdxButton, CdxTextInput, CdxSelect, CdxField, CdxTabs, CdxTab, CdxToggleButton);
        }).catch(function(error) {
            console.error('[script-installer] Failed to load Vue/Codex:', error);
            container.html('<div class="error">Failed to load interface. Please refresh the page.</div>');
        });
        
        return container;
    }

    function createVuePanel(container, createApp, defineComponent, ref, computed, CdxDialog, CdxButton, CdxTextInput, CdxSelect, CdxField, CdxTabs, CdxTab, CdxToggleButton) {
        // Make imports reactive and set global reference
        importsRef = ref(imports);
        
        var ScriptManager = defineComponent({
            components: { CdxDialog, CdxButton, CdxTextInput, CdxSelect, CdxField, CdxTabs, CdxTab, CdxToggleButton },
            setup() {
                var dialogOpen = ref(true);
                var filterText = ref('');
                var selectedSkin = ref('common');
                var loadingStates = ref({});
                var removedScripts = ref([]);
                var gadgetSectionLabels = ref({});
                var gadgetsLabel = ref('Gadgets');
                var enabledOnly = ref(false);
                
                // Create skin tabs
                var skinTabs = computed(function() {
                    return [
                        { name: 'all', label: STRINGS.allSkins },
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
                        var sectionOrder = gadgetSectionOrder;
                        
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
                                        return anImport.getDescription().toLowerCase().includes(filterText.value.toLowerCase().trim());
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
                        // Reload data without closing dialog
                        buildImportList().then(function() {
                            if (importsRef) {
                                importsRef.value = imports;
                            }
                        });
                    }).fail(function(error) {
                        console.error('Failed to normalize:', error);
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
                            // Reload data without closing dialog
                            buildImportList().then(function() {
                                if (importsRef) {
                                    importsRef.value = imports;
                                }
                            });
                        }).fail(function(error) {
                            console.error('Failed to restore:', error);
                            showNotification('notificationRestoreError', 'error', anImport.getDescription());
                        }).always(function() {
                            setLoading(key, false);
                        });
                    } else {
                        // Remove script
                        anImport.uninstall().done(function() {
                            // Add to removed list
                            removedScripts.value.push(scriptName);
                            // Reload data without closing dialog
                            buildImportList().then(function() {
                                if (importsRef) {
                                    importsRef.value = imports;
                                }
                            });
                        }).fail(function(error) {
                            console.error('Failed to uninstall:', error);
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
                        // Reload data without closing dialog
                        buildImportList().then(function() {
                            if (importsRef) {
                                importsRef.value = imports;
                            }
                        });
                    }).fail(function(error) {
                        console.error('Failed to toggle disabled state:', error);
                        showNotification('notificationGeneralError', 'error');
                    }).always(function() {
                        setLoading(key, false);
                    });
                };
                
                var handleMove = function(anImport) {
                    showMoveDialog(anImport);
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
                        // Reload data without closing dialog
                        buildImportList().then(function() {
                            if (importsRef) {
                                importsRef.value = imports;
                            }
                        });
                    }).fail(function(error) {
                        console.error('Failed to normalize some scripts:', error);
                        showNotification('notificationNormalizeError', 'error');
                    });
                };

                var handleGadgetToggle = function(gadgetName, enabled) {
                    var key = 'gadget-' + gadgetName;
                    setLoading(key, true);
                    
                    toggleGadget(gadgetName, enabled).then(function() {
                        showNotification('Gadget ' + gadgetName + ' ' + (enabled ? 'enabled' : 'disabled'), 'success');
                    }).catch(function(error) {
                        console.error('Failed to toggle gadget:', error);
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
                    STRINGS: STRINGS,
                    SKINS: SKINS,
                    mw: mw,
                    mounted: function() {
                        var self = this;
                        // Update data from global variables after mount
                        if (window.gadgetSectionLabels) {
                            self.gadgetSectionLabels = window.gadgetSectionLabels;
                        }
                        if (window.gadgetsLabel) {
                            self.gadgetsLabel = window.gadgetsLabel;
                        }
                    }
                };
            },
            template: `
                <cdx-dialog
                    class="sm-cdx-dialog"
                    v-model:open="dialogOpen"
                    :title="STRINGS.scriptManagerTitle"
                    :use-close-button="true"
                >
                    <div class="script-installer-subtitle">
                        {{ STRINGS.panelHeader }}
                    </div>
                    <div class="script-installer-controls">
                        <div class="script-installer-search-wrap">
                            <cdx-text-input
                                v-model="filterText"
                                :placeholder="STRINGS.quickFilter"
                                clearable
                            />
                        </div>
                        
                        <div class="script-installer-skin-tabs-bar">
                            <div class="script-installer-skin-tabs">
                                <cdx-tabs v-model:active="selectedSkin">
                                    <cdx-tab v-for="tab in skinTabs" :key="tab.name" :name="tab.name" :label="tab.label"></cdx-tab>
                                </cdx-tabs>
                            </div>
                            <div class="script-installer-enabled-toggle">
                                <cdx-toggle-button v-model="enabledOnly" :aria-label="STRINGS.enabledOnly">
                                    {{ STRINGS.enabledOnly }}
                                </cdx-toggle-button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="script-installer-scroll">
                        <!-- Gadgets tab -->
                        <template v-if="selectedSkin === 'gadgets'">
                            <div class="gadgets-section">
                                <div v-if="Object.keys(filteredImports).length === 0" class="no-gadgets">
                                    <p>{{ STRINGS.noGadgetsAvailable }}</p>
                                    <p>{{ STRINGS.thisMightBeBecause }}</p>
                                    <ul>
                                        <li>{{ STRINGS.gadgetsNotInstalled }}</li>
                                        <li>{{ STRINGS.noGadgetsConfigured }}</li>
                                        <li>{{ STRINGS.apiAccessRestricted }}</li>
                                    </ul>
                                </div>
                                <div v-else class="gadgets-list">
                                    <div v-for="(sectionData, sectionName) in filteredImports" :key="sectionName" class="gadget-section">
                                        <h4 class="gadget-section-title">{{ (gadgetSectionLabels && gadgetSectionLabels[sectionName]) || sectionData.label }}</h4>
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
                                                           (isGadgetEnabled(gadgetName) ? STRINGS.disableLinkText : STRINGS.enableLinkText) }}
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
                                        {{ STRINGS.skinCommon }}
                                    </a>
                                </template>
                                <template v-else-if="targetName === 'global'">
                                    <a :href="getSkinUrl(targetName)" target="_blank">
                                        {{ STRINGS.globalAppliesToAllWikis }}
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
                                        <a :href="anImport.getHumanUrl()" class="script-link">
                                            {{ anImport.getDescription() }}
                                        </a>
                                    </div>
                                    
                                    <div class="script-actions">
                                        <cdx-button 
                                            weight="quiet" 
                                            size="small"
                                            :disabled="loadingStates['uninstall-' + anImport.getDescription()]"
                                            @click="handleUninstall(anImport)"
                                        >
                                            {{ loadingStates['uninstall-' + anImport.getDescription()] ? '...' : 
                                               (removedScripts.includes(anImport.getDescription()) ? STRINGS.restoreLinkText : STRINGS.uninstallLinkText) }}
                                        </cdx-button>
                                        
                                        <cdx-button 
                                            weight="quiet" 
                                            size="small"
                                            :disabled="loadingStates['toggle-' + anImport.getDescription()]"
                                            @click="handleToggleDisabled(anImport)"
                                        >
                                            {{ loadingStates['toggle-' + anImport.getDescription()] ? '...' : (anImport.disabled ? STRINGS.enableLinkText : STRINGS.disableLinkText) }}
                                        </cdx-button>
                                        
                                        <cdx-button 
                                            weight="quiet" 
                                            size="small"
                                            :disabled="loadingStates['move-' + anImport.getDescription()]"
                                            @click="handleMove(anImport)"
                                        >
                                            {{ loadingStates['move-' + anImport.getDescription()] ? '...' : STRINGS.moveLinkText }}
                                        </cdx-button>
                                    </div>
                                </cdx-card>
                            </div>
                        </div>
                        </template>
                    </div>
                    
                    <div class="script-installer-dialog-module">
                        <div class="script-installer-bottom-left">
                            <!-- Empty left side for now -->
                        </div>
                        <div class="script-installer-dialog-actions">
                            <cdx-button 
                                weight="primary"
                                :disabled="Object.keys(filteredImports).length === 0 || selectedSkin === 'gadgets'"
                                @click="handleNormalizeAll"
                            >
                                {{ STRINGS.normalize }}
                            </cdx-button>
                        </div>
                    </div>
                </cdx-dialog>
            `
        });
        
        try {
            var app = createApp(ScriptManager);
            var mountedApp = app.mount(container[0]);
            
            // Store reference to Vue component for data updates
            window.scriptInstallerVueComponent = mountedApp;
        } catch (error) {
            console.error('[script-installer] Error mounting Vue app:', error);
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
            if( contentModel === "javascript" ) {
                var prefixLength = mw.config.get( "wgUserName" ).length + USER_NAMESPACE_NAME.length + 1; // +1 for ":"
                if( pageName.indexOf( USER_NAMESPACE_NAME + ":" + mw.config.get( "wgUserName" ) ) === 0 ) {
                    var skinIndex = SKINS.indexOf( pageName.substring( prefixLength ).slice( 0, -3 ) );
                    if( skinIndex >= 0 ) {
                        return $( "<abbr>" ).text( STRINGS.cannotInstall )
                                .attr( "title", STRINGS.cannotInstallSkin );
                    }
                }
                addingInstallLink = true;
            } else {
                return $( "<abbr>" ).text( STRINGS.cannotInstall + " (" + STRINGS.notJavaScript + ")" )
                        .attr( "title", STRINGS.cannotInstallContentModel.replace( "$1", contentModel ) );
            }
        }

        // Namespace 8 is MediaWiki
        if( namespaceNumber === SM_MEDIAWIKI_NAMESPACE_NUMBER ) {
            return $( "<a>" ).text( STRINGS.installViaPreferences )
                    .attr( "href", mw.util.getUrl( "Special:Preferences" ) + "#mw-prefsection-gadgets" );
        }

        var editRestriction = mw.config.get( "wgRestrictionEdit" ) || [];
        if( ( namespaceNumber !== SM_USER_NAMESPACE_NUMBER && namespaceNumber !== SM_MEDIAWIKI_NAMESPACE_NUMBER ) &&
            ( editRestriction.indexOf( "sysop" ) >= 0 ||
                editRestriction.indexOf( "editprotected" ) >= 0 ) ) {
            installElement.append( " ",
                $( "<abbr>" ).append(
                    $( "<img>" ).attr( "src", "https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Achtung-yellow.svg/20px-Achtung-yellow.svg.png" ).addClass( "warning" ),
                    STRINGS.insecure )
                .attr( "title", STRINGS.tempWarning ) );
            addingInstallLink = true;
        }

        if( addingInstallLink ) {
            var fixedPageName = mw.config.get( "wgPageName" ).replace( /_/g, " " );
            installElement.prepend( $( "<a>" )
                    .attr( "id", "script-installer-main-install" )
                    .text( localScriptsByName[ fixedPageName ] ? STRINGS.uninstallLinkText : STRINGS.installLinkText )
                    .click( makeLocalInstallClickHandler( fixedPageName ) ) );

            // If the script is installed but disabled, allow the user to enable it
            var allScriptsInTarget = (importsRef && importsRef.value) ? importsRef.value[ localScriptsByName[ fixedPageName ] ] : imports[ localScriptsByName[ fixedPageName ] ];
            var importObj = allScriptsInTarget && allScriptsInTarget.find( function ( anImport ) { return anImport.page === fixedPageName; } );
            if( importObj && importObj.disabled ) {
                installElement.append( " | ",
                    $( "<a>" )
                        .attr( "id", "script-installer-main-enable" )
                        .text( STRINGS.enableLinkText )
                        .click( function () {
                            $( this ).text( STRINGS.enableProgressMsg );
                            importObj.setDisabled( false ).done( function () {
                                conditionalReload( false );
                            } );
                        } ) );
            }
            return installElement;
        }

        return $( "<abbr>" ).text( STRINGS.cannotInstall + " " + STRINGS.insecure )
                .attr( "title", STRINGS.badPageError );
    }

    function showUi() {
        if( !document.getElementById( "script-installer-top-container" ) ) {
            var fixedPageName = mw.config.get( "wgPageName" ).replace( /_/g, " " );
            $( "#firstHeading" ).append( $( "<span>" )
                .attr( "id", "script-installer-top-container" )
                .append(
                    buildCurrentPageInstallElement(),
                    " | ",
                    $( "<a>" )
                        .text( STRINGS.manageUserScripts ).click( function () {
                            if( !document.getElementById( "script-installer-panel" ) ) {
                                $( "#mw-content-text" ).before( makePanel() );
                            } else {
                                $( "#script-installer-panel" ).remove();
                            }
                         } ) ) );
        }
    }

    function attachInstallLinks() {
        // At the end of each {{Userscript}} transclusion, there is
        // <span id='User:Foo/Bar.js' class='scriptInstallerLink'></span>
        $( "span.scriptInstallerLink" ).each( function () {
            var scriptName = this.id;
            if( $( this ).find( "a" ).length === 0 ) {
                $( this ).append( " | ", $( "<a>" )
                        .text( localScriptsByName[ scriptName ] ? STRINGS.uninstallLinkText : STRINGS.installLinkText )
                        .click( makeLocalInstallClickHandler( scriptName ) ) );
            }
        } );

        $( "table.infobox-user-script" ).each( function () {
            if( $( this ).find( ".script-installer-ibx" ).length === 0 ) {
                var scriptName = $( this ).find( "th:contains('Source')" ).next().text() ||
                        mw.config.get( "wgPageName" );
                scriptName = /user:.+?\/.+?.js/i.exec( scriptName )[0];
                $( this ).children( "tbody" ).append( $( "<tr>" ).append( $( "<td>" )
                        .attr( "colspan", "2" )
                        .addClass( "script-installer-ibx" )
                        .append( $( "<button>" )
                            .addClass( "mw-ui-button mw-ui-progressive mw-ui-big" )
                            .text( localScriptsByName[ scriptName ] ? STRINGS.uninstallLinkText : STRINGS.installLinkText )
                            .click( makeLocalInstallClickHandler( scriptName ) ) ) ) );
            }
        } );
    }

    function makeLocalInstallClickHandler( scriptName ) {
        return function () {
            var $this = $( this );
            if( $this.text() === STRINGS.installLinkText ) {
                // Show install dialog instead of confirm
                showInstallDialog( scriptName, $this );
            } else {
                $( this ).text( STRINGS.uninstallProgressMsg )
                var uninstalls = uniques( localScriptsByName[ scriptName ] )
                        .map( function ( target ) { return Import.ofLocal( scriptName, target ).uninstall(); } )
                $.when.apply( $, uninstalls ).then( function () {
                    $( this ).text( STRINGS.installLinkText );
                    conditionalReload( false );
                }.bind( this ) );
            }
         };
    }

    function showInstallDialog( scriptName, buttonElement ) {
        // Create container for install dialog
        var container = $( "<div>" ).attr( "id", "script-installer-install-dialog" );
        
        // Load Vue and Codex for install dialog
        mw.loader.using(['vue', '@wikimedia/codex']).then(function() {
            var VueMod = mw.loader.require('vue');
            var CodexPkg = mw.loader.require('@wikimedia/codex');
            
            var createApp = VueMod.createApp || VueMod.createMwApp;
            var defineComponent = VueMod.defineComponent;
            var ref = VueMod.ref;
            
            var CdxDialog = CodexPkg.CdxDialog || (CodexPkg.components && CodexPkg.components.CdxDialog);
            var CdxButton = CodexPkg.CdxButton || (CodexPkg.components && CodexPkg.components.CdxButton);
            var CdxSelect = CodexPkg.CdxSelect || (CodexPkg.components && CodexPkg.components.CdxSelect);
            var CdxField = CodexPkg.CdxField || (CodexPkg.components && CodexPkg.components.CdxField);
            
            if (!createApp || !CdxDialog || !CdxButton || !CdxSelect || !CdxField) {
                throw new Error('Codex/Vue components not available for install dialog');
            }
            
            createInstallDialog(container, createApp, defineComponent, ref, CdxDialog, CdxButton, CdxSelect, CdxField, scriptName, buttonElement);
        }).catch(function(error) {
            console.error('[script-installer] Failed to load Vue/Codex for install dialog:', error);
            // Fallback to old confirm dialog
            var okay = window.confirm(
                STRINGS.bigSecurityWarning.replace( '$1',
                    STRINGS.securityWarningSection.replace( '$1', scriptName ) ) );
            if( okay ) {
                buttonElement.text( STRINGS.installProgressMsg )
                    syncInstallTarget(); // Ensure we have the latest value
                    Import.ofLocal( scriptName, window.scriptInstallerInstallTarget ).install().done( function () {
                    buttonElement.text( STRINGS.uninstallLinkText );
                    conditionalReload( false );
                }.bind( buttonElement ) );
            }
        });
        
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
                    var label = skin === 'common' ? STRINGS.skinCommon : skin;
                    return { label: label, value: skin };
                });
                
                var handleInstall = function() {
                    isInstalling.value = true;
                    buttonElement.text(STRINGS.installProgressMsg);
                    
                    Import.ofLocal(scriptName, selectedSkin.value).install().done(function() {
                        buttonElement.text(STRINGS.uninstallLinkText);
                        dialogOpen.value = false;
                        conditionalReload(false);
                    }).fail(function(error) {
                        console.error('Failed to install script:', error);
                        showNotification('notificationInstallError', 'error', anImport.getDescription());
                        buttonElement.text(STRINGS.installLinkText);
                    }).always(function() {
                        isInstalling.value = false;
                    });
                };
                
                var handleCancel = function() {
                    dialogOpen.value = false;
                };
                
                return {
                    dialogOpen,
                    selectedSkin,
                    isInstalling,
                    skinOptions,
                    handleInstall,
                    handleCancel,
                    STRINGS: STRINGS,
                    scriptName: scriptName
                };
            },
            template: `
                <cdx-dialog
                    v-model:open="dialogOpen"
                    :title="'Install ' + scriptName"
                    :use-close-button="true"
                    :default-action="{ label: 'Cancel' }"
                    :primary-action="{ label: isInstalling ? 'Installing...' : 'Install', actionType: 'progressive', disabled: isInstalling }"
                    @default="handleCancel"
                    @primary="handleInstall"
                >
                    <p>{{ STRINGS.bigSecurityWarning.replace('$1', STRINGS.securityWarningSection.replace('$1', scriptName)) }}</p>
                    
                    <cdx-field>
                        <template #label>Install to skin:</template>
                        <cdx-select
                            v-model:selected="selectedSkin"
                            :menu-items="skinOptions"
                            default-label="Select skin"
                        />
                    </cdx-field>
                </cdx-dialog>
            `
        });
        
        try {
            var app = createApp(InstallDialog);
            app.mount(container[0]);
        } catch (error) {
            console.error('[script-installer] Error mounting install dialog:', error);
            container.remove();
        }
    }

    function showMoveDialog(anImport) {
        // Create container for move dialog
        var container = $( "<div>" ).attr( "id", "script-installer-move-dialog" );
        
        // Load Vue and Codex for move dialog
        mw.loader.using(['vue', '@wikimedia/codex']).then(function() {
            var VueMod = mw.loader.require('vue');
            var CodexPkg = mw.loader.require('@wikimedia/codex');
            
            var createApp = VueMod.createApp || VueMod.createMwApp;
            var defineComponent = VueMod.defineComponent;
            var ref = VueMod.ref;
            
            var CdxDialog = CodexPkg.CdxDialog || (CodexPkg.components && CodexPkg.components.CdxDialog);
            var CdxButton = CodexPkg.CdxButton || (CodexPkg.components && CodexPkg.components.CdxButton);
            var CdxSelect = CodexPkg.CdxSelect || (CodexPkg.components && CodexPkg.components.CdxSelect);
            var CdxField = CodexPkg.CdxField || (CodexPkg.components && CodexPkg.components.CdxField);
            
            if (!createApp || !CdxDialog || !CdxButton || !CdxSelect || !CdxField) {
                throw new Error('Codex/Vue components not available for move dialog');
            }
            
            createMoveDialog(container, createApp, defineComponent, ref, CdxDialog, CdxButton, CdxSelect, CdxField, anImport);
        }).catch(function(error) {
            console.error('[script-installer] Failed to load Vue/Codex for move dialog:', error);
            // Fallback to old prompt dialog
            var dest = null;
            var PROMPT = STRINGS.movePrompt + " " + SKINS.join(", ");
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
                console.error('Failed to move script:', error);
                showNotification('notificationMoveError', 'error', anImport.getDescription());
            }).always(function() {
                setLoading(key, false);
            });
        });
        
        // Add to body
        $('body').append(container);
    }

    function createMoveDialog(container, createApp, defineComponent, ref, CdxDialog, CdxButton, CdxSelect, CdxField, anImport) {
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
                        label: skin === 'global' ? STRINGS.globalAppliesToAllWikis : skin,
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
                    }).fail(function(error) {
                        console.error('Failed to move script:', error);
                        showNotification('notificationMoveError', 'error', anImport.getDescription());
                    }).always(function() {
                        isMoving.value = false;
                    });
                };
                
                var handleClose = function() {
                    dialogOpen.value = false;
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
                    STRINGS: STRINGS
                };
            },
            template: `
                <CdxDialog
                    v-model:open="dialogOpen"
                    :title="STRINGS.moveDialogTitle.replace('$1', scriptName)"
                    :use-close-button="true"
                    @close="handleClose"
                >
                    <div class="script-installer-move-content">
                        <p><strong>{{ STRINGS.currentLocation }}</strong> {{ currentTarget === 'global' ? STRINGS.globalAppliesToAllWikis : currentTarget }}</p>
                        
                        <CdxField>
                            <template #label>{{ STRINGS.moveToSkin }}</template>
                            <CdxSelect
                                v-model:selected="selectedTarget"
                                :menu-items="targetOptions"
                                :disabled="isMoving"
                                :default-label="STRINGS.selectTargetSkin"
                            />
                        </CdxField>
                        
                        <div class="script-installer-move-actions">
                            <CdxButton
                                @click="handleMove"
                                :disabled="isMoving"
                                action="progressive"
                            >
                                {{ isMoving ? STRINGS.movingProgress : STRINGS.moveScriptButton }}
                            </CdxButton>
                        </div>
                    </div>
                </CdxDialog>
            `
        });
        
        try {
            var app = createApp(MoveDialog);
            app.mount(container[0]);
        } catch (error) {
            console.error('[script-installer] Error mounting move dialog:', error);
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
            return STRINGS_EN[summaryKey].replace( "$1", description ) + (ADVERT ? " " + ADVERT : "");
        } else {
            // Use localized summary for local scripts
            return STRINGS[summaryKey].replace( "$1", description ) + (ADVERT ? " " + ADVERT : "");
        }
    }

    // From https://stackoverflow.com/a/10192255
    function uniques( array ){
        return array.filter( function( el, index, arr ) {
            return index === arr.indexOf( el );
        });
    }

    // Initialize global configuration from window properties
    if( window.scriptInstallerAutoReload !== undefined ) {
        scriptInstallerAutoReload = window.scriptInstallerAutoReload;
    }

    // scriptInstallerInstallTarget should remain accessible via window for user configuration
    if( window.scriptInstallerInstallTarget === undefined ) {
        window.scriptInstallerInstallTarget = "common"; // Set default if not configured
    }
    
    // Function to sync local reference with global value
    function syncInstallTarget() {
        scriptInstallerInstallTarget = window.scriptInstallerInstallTarget;
    }
    syncInstallTarget(); // Initial sync

    // ADVERT is now set via window.ADVERT or uses the default value
    if (typeof window.ADVERT === 'string') {
        ADVERT = window.ADVERT;
    } else {
        ADVERT = "([[User:Enterprisey/script-installer|script-installer]])";
    }

    var jsPage = mw.config.get( "wgPageName" ).slice( -3 ) === ".js" ||
        mw.config.get( "wgPageContentModel" ) === "javascript";

    // Load languageFallbacks.json from GitLab via CORS proxy
    var languageFallbacks = {};
    fetch('https://gitlab-content.toolforge.org/iniquity/script-installer/-/raw/main/data/languageFallbacks.json?mime=application/json')
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

    function loadI18nWithFallback(lang, callback) {
      const chain = getLanguageChain(lang);
      let idx = 0;
      let loadedCount = 0;
      
      function tryNext() {
        if (idx >= chain.length) {
          console.error('No localization found for any fallback language');
          return;
        }
        const tryLang = chain[idx++];
        const url = `https://gitlab-content.toolforge.org/iniquity/script-installer/-/raw/main/i18n/${tryLang}.json?mime=application/json`;
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
            console.error('Failed to load i18n for', tryLang, ':', err);
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

    // Prewarm Codex bundles early to speed up first open of the modal
    try { 
        if (mw && mw.loader && typeof mw.loader.load === 'function') { 
            mw.loader.load(['vue', '@wikimedia/codex']); 
            smLog('prewarm: requested vue+codex'); 
        } 
    } catch(e) {}

    // Using:
    var userLang = mw.config.get('wgUserLanguage') || 'en';
    loadI18nWithFallback(userLang, function() {
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
            
            // Store data globally for Vue component
            gadgetSectionOrder = sectionOrder;
            gadgetSectionLabels = sectionLabels;
            gadgetsLabel = gadgetsLabel;
            
            // Update Vue component if it exists
            if (window.scriptInstallerVueComponent) {
                window.scriptInstallerVueComponent.gadgetSectionLabels = sectionLabels;
                window.scriptInstallerVueComponent.gadgetsLabel = gadgetsLabel;
                // Force update like in maintenance-core.js
                if (typeof window.scriptInstallerVueComponent.$forceUpdate === 'function') {
                    window.scriptInstallerVueComponent.$forceUpdate();
                }
            }
            
            return { imports: imports, gadgets: gadgets, userSettings: userSettings, sectionOrder: sectionOrder, sectionLabels: sectionLabels, gadgetsLabel: gadgetsLabel };
          });
        }).then(function(data) {
          attachInstallLinks();
          if (jsPage) showUi();
          if (document.cookie.indexOf("open_script_installer=yes") >= 0) {
            document.cookie = "open_script_installer=; expires=Thu, 01 Jan 1970 00:00:01 GMT";
            $("#script-installer-top-container a:contains('Manage')").trigger("click");
          }
        });
      });
    });
} )();
