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
  /********************************************
     * Constants & Globals
     ********************************************/
  // An mw.Api object
  let api
  let metaApi

  // Keep "common" at beginning
  const SKINS = [ 'common', 'global', 'monobook', 'minerva', 'vector', 'vector-2022', 'timeless' ]
  // Module-scoped default target (mirrors window.SM_DEFAULT_SKIN)
  let SM_DEFAULT_SKIN = 'common'

  // The master import list, keyed by target. (A "target" is a user JS subpage
  // where the script is imported, like "common" or "vector".) Set in buildImportList
  let imports = {}

  // Local script targets are now derived on demand from `imports` (no globals)

  // Reactive reference for Vue component
  let importsRef = null

  // Gadgets data
  let gadgetsData = {}
  let userGadgetSettings = {}

  // Internal UI metadata (no globals)
  const gadgetSectionOrderVar = []
  let gadgetSectionLabelsVar = {}
  let gadgetsLabelVar = 'Gadgets'
  // Keep direct refs to Vue state for external reactive updates
  let gadgetSectionLabelsRef = null
  let gadgetsLabelRef = null
  let scriptInstallerVueComponent = null

  // Goes on the end of edit summaries
  const SUMMARY_TAG = '([[mw:User:Iniquity/scriptManager.js|Script Manager]])'

  // Strings, for translation
  let STRINGS = {}
  let STRINGS_EN = {}
  let STRINGS_SITE = {}

  const USER_NAMESPACE_NAME = mw.config.get( 'wgFormattedNamespaces' )[2]

  // Global constants (SM_ prefix per maintenance-core.js pattern)
  const SM_DEBUG_PREFIX = '[SM]'
  const SM_NOTIFICATION_DISPLAY_TIME = 4000
  const SM_NOTIFICATION_CLEANUP_DELAY = 4200
  const SM_USER_NAMESPACE_NUMBER = 2
  const SM_MEDIAWIKI_NAMESPACE_NUMBER = 8

  /********************************************
     * Logger
     ********************************************/
  /**
     * Resolve current log level (silent,error,warn,info,debug)
     * @returns {number} numeric level (0..4)
     */
  const SM_LOG_LEVEL_VAR = (function () {
    try {
      return (window.SM_LOG_LEVEL || (window.scriptInstallerDebug ? 'debug' : 'info') || 'info').toString().toLowerCase() 
    } catch (_) {
      return 'info' 
    }
  })()
  function getLogLevel () {
    try {
      const lvl = SM_LOG_LEVEL_VAR
      const map = { silent:0, error:1, warn:2, info:3, debug:4 }
      return map.hasOwnProperty(lvl) ? map[lvl] : 3
    } catch (_) {
      return 3 
    }
  }
  /** Debug log */
  function smLog () {
    const lvl = getLogLevel()
    if (lvl < 4) return // debug only
    try {
      console.debug.apply(console, [SM_DEBUG_PREFIX].concat([].slice.call(arguments))) 
    } catch (_) {}
  }
  /** Info log */
  function smInfo () {
    const lvl = getLogLevel()
    if (lvl < 3) return
    try {
      console.info.apply(console, [SM_DEBUG_PREFIX].concat([].slice.call(arguments))) 
    } catch (_) {}
  }
  /** Warning log */
  function smWarn () {
    const lvl = getLogLevel()
    if (lvl < 2) return
    try {
      console.warn.apply(console, [SM_DEBUG_PREFIX].concat([].slice.call(arguments))) 
    } catch (_) {}
  }
  /** Error log */
  function smError () {
    const lvl = getLogLevel()
    if (lvl < 1) return
    try {
      console.error.apply(console, [SM_DEBUG_PREFIX].concat([].slice.call(arguments))) 
    } catch (_) {}
  }
  // No global exposure for logger

  /********************************************
     * Utilities
     ********************************************/
  // Normalize localized User namespace to canonical English for URLs
  function canonicalizeUserNamespace (title) {
    try {
      if (typeof title !== 'string') return title
      const idx = title.indexOf(':')
      if (idx <= 0) return title
      const ns = title.slice(0, idx)
      const rest = title.slice(idx + 1)
      if (ns === USER_NAMESPACE_NAME || ns.toLowerCase() === 'user') {
        return 'User:' + rest
      }
      return title
    } catch (e) {
      smLog('canonicalizeUserNamespace failed', e); return title 
    }
  }

  // Normalize jQuery Deferred or native Promise into a native Promise
  function toPromise (maybeThenable) {
    try {
      if (!maybeThenable) return Promise.resolve()
      if (typeof maybeThenable.then === 'function') return maybeThenable
      if (typeof maybeThenable.done === 'function') {
        return new Promise(function (resolve, reject) {
          try {
            maybeThenable.done(resolve).fail(reject) 
          } catch (e) {
            reject(e) 
          } 
        })
      }
    } catch (_) {}
    return Promise.resolve()
  }

  // Compute initial label (Install/Uninstall) for a script name
  function getInitialInstallLabel (scriptName) {
    try {
      return (getTargetsForScript(scriptName).length ? SM_t('action-uninstall') : SM_t('action-install')) 
    } catch (_) {
      return SM_t('action-install') 
    }
  }

  function buildRawLoaderUrl (host, title) {
    const normalized = canonicalizeUserNamespace(title)
    const isCss = /\.css$/i.test(String(normalized||''))
    const ctype = isCss ? 'text/css' : 'text/javascript'
    return '//' + host + '/w/index.php?title=' + normalized + '&action=raw&ctype=' + ctype
  }

  // Lazy-load and cache Vue/Codex modules
  let _vueCodexCache = null
  function loadVueCodex () {
    if (_vueCodexCache) return _vueCodexCache
    _vueCodexCache = mw.loader.using(['vue', '@wikimedia/codex']).then(function () {
      const VueMod = mw.loader.require('vue')
      const CodexPkg = mw.loader.require('@wikimedia/codex')
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
      }
    })
    return _vueCodexCache
  }

  // Safe unmount (mirrors maintenance-core.js pattern)
  function safeUnmount (app, root) {
    try {
      if (app && typeof app.unmount === 'function') app.unmount() 
    } catch (e) {}
    try {
      if (root && root.parentNode) root.parentNode.removeChild(root) 
    } catch (e) {}
  }


  // Generic Codex icon loader (mirrors maintenance-core.js approach)
  function smLoadCodexIconViaAPI (iconName) {
    const keyRaw = 'SM_ICON_RAW_' + iconName
    let cached = null
    try {
      cached = localStorage.getItem(keyRaw) 
    } catch (e) {}
    if (cached) {
      return Promise.resolve(cached) 
    }
    const url = 'https://www.mediawiki.org/w/api.php?action=query&format=json&formatversion=2&origin=*'
            + '&list=codexicons&names=' + encodeURIComponent(iconName)
    return fetch(url)
      .then(function (r) {
        return r.json() 
      })
      .then(function (data) {
        const ci = data && data.query && data.query.codexicons
        let raw = null
        if (Array.isArray(ci)) {
          const item = ci[0] || null
          raw = item && (item.icon || item.svg || item.value || null)
        } else if (ci && typeof ci === 'object') {
          raw = ci[iconName] || null
        }
        try {
          if (typeof raw === 'string') localStorage.setItem(keyRaw, raw) 
        } catch (e) {}
        return raw
      }).catch(function () {
        return null 
      })
  }

  function smRenderIconInto (el, iconName, colorHex, sizePx) {
    const keyMarkup = 'SM_ICON_MARKUP_' + iconName + '_' + (colorHex||'') + '_' + (sizePx||'')
    try {
      const cm = localStorage.getItem(keyMarkup); if (cm) {
        el.innerHTML = cm; return 
      } 
    } catch (e) {}
    smLoadCodexIconViaAPI(iconName).then(function (raw) {
      if (!raw || !el) return
      let markup = ''
      const size = sizePx || 16
      const color = colorHex || 'currentColor'
      if (typeof raw === 'string') {
        if (raw.indexOf('<svg') !== -1) {
          markup = raw 
        } else {
          markup = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="' + size + '" height="' + size + '" fill="' + color + '">' + raw + '</svg>' 
        }
      }
      if (markup) {
        el.innerHTML = markup
        try {
          localStorage.setItem(keyMarkup, markup) 
        } catch (e) {}
      }
    })
  }

  /**
     * Update in-memory gadget section labels and notify mounted Vue component
     * @param {Object<string,string>} sectionLabels map of section->label
     * @param {string} gadgetsLabel display label for Gadgets tab
     */
  function applyGadgetLabels (sectionLabels, gadgetsLabel) {
    gadgetSectionLabelsVar = sectionLabels || {}
    gadgetsLabelVar = gadgetsLabel || 'Gadgets'
    smInfo('applyGadgetLabels: input sections =', Object.keys(gadgetSectionLabelsVar||{}), 'gadgetsLabel =', gadgetsLabelVar)
    try {
      // Update via stored refs if available
      if (gadgetSectionLabelsRef && typeof gadgetSectionLabelsRef === 'object' && 'value' in gadgetSectionLabelsRef) {
        gadgetSectionLabelsRef.value = Object.assign({}, gadgetSectionLabelsVar)
      }
      if (gadgetsLabelRef && typeof gadgetsLabelRef === 'object' && 'value' in gadgetsLabelRef) {
        gadgetsLabelRef.value = gadgetsLabelVar
      }
      const comp = scriptInstallerVueComponent
      if (comp) {
        smInfo('applyGadgetLabels: applied via refs (have=', !!(gadgetSectionLabelsRef&&gadgetsLabelRef), ')')
        try {
          (typeof requestAnimationFrame==='function'?requestAnimationFrame:setTimeout)(function () {
            if (typeof comp.$forceUpdate === 'function') comp.$forceUpdate() 
          }, 0) 
        } catch (_) {}
      }
    } catch (e) {
      smLog('applyGadgetLabels failed', e) 
    }
  }

  /**
     * Derive all targets where given script is installed from current imports
     * @param {string} name script page name
     * @returns {string[]} targets
     */
  function getTargetsForScript (name) {
    try {
      const current = (importsRef && importsRef.value) ? importsRef.value : imports
      const map = Object.create(null)
      Object.keys(current || {}).forEach(function (target) {
        (current[target] || []).forEach(function (anImport) {
          if (anImport && anImport.page === name) {
            map[target] = true 
          }
        })
      })
      return Object.keys(map)
    } catch (e) {
      smLog('getTargetsForScript failed', e); return [] 
    }
  }

  /********************************************
     * Import model & parser
     ********************************************/
  /**
     * Get interwiki prefix for a Wikimedia host fragment captured from URL
     * @param {string} wiki e.g. "en.wikipedia", "commons.wikimedia", "wikidata", "mediawiki"
     * @returns {string|null}
     */
  function getProjectPrefix (wiki) {
    try {
      if (!wiki || typeof wiki !== 'string') return null
      const s = wiki.toLowerCase().replace(/^www\./, '')
      // Language projects (wikipedia and sister projects on their own domains)
      const m = s.match(/^([a-z-]{2,10})\.(wikipedia|wiktionary|wikibooks|wikiquote|wikisource|wikinews|wikiversity|wikivoyage)$/)
      if (m) {
        const lang = m[1]
        const proj = m[2]
        if (proj === 'wikipedia') return 'w:' + lang
        const map = { wiktionary:'wikt', wikibooks:'b', wikiquote:'q', wikisource:'s', wikinews:'n', wikiversity:'v', wikivoyage:'voyage' }
        return (map[proj] || proj) + ':' + lang
      }
      // *.wikimedia.org family (commons.wikimedia.org, meta.wikimedia.org, species.wikimedia.org)
      const wm = s.match(/^([a-z-]{2,20})\.wikimedia$/)
      if (wm) {
        const project = wm[1]
        if (project === 'commons' || project === 'meta' || project === 'species') return project
      }
      // Single-domain projects
      if (s === 'wikidata') return 'd'
      if (s === 'mediawiki') return 'mw'
      return null
    } catch (_) {
      return null 
    }
  }

  /**
     * Get wiki fragment (e.g., "en.wikipedia", "commons.wikimedia") from current server
     * @returns {string|null}
     */
  function getCurrentWikiFragment () {
    try {
      const server = (mw && mw.config && mw.config.get ? (mw.config.get('wgServerName') || '') : '')
      if (!server) return null
      return server.toLowerCase().replace(/\.org$/, '').replace(/^www\./, '')
    } catch (_) {
      return null 
    }
  }

  /**
     * Get target wiki fragment for a given installation target
     * @param {string} target e.g., 'global' or skin name
     * @returns {string|null}
     */
  function getTargetWikiFragment (target) {
    try {
      if (target === 'global') return 'meta.wikimedia'
      return getCurrentWikiFragment()
    } catch (_) {
      return null 
    }
  }

  /**
     * Convert absolute Wikimedia URL to interwiki link
     * @param {string} url
     * @returns {string|null}
     */
  function urlToInterwiki (url) {
    try {
      const a = document.createElement('a'); a.href = url
      const host = (a.hostname||'').toLowerCase()
      const path = (a.pathname||'').replace(/^\/+/, '')
      const title = decodeURIComponent(path.replace(/^wiki\//, '').replace(/_/g, ' '))
      const frag = host.replace(/^www\./, '').replace(/\.org$/, '')
      const pr = getProjectPrefix(frag)
      if (pr) return pr + ':' + title
    } catch (_) {}
    return null
  }

  /**
     * Try to resolve Documentation interwiki link for an import
     * @param {object} imp createImport instance
     * @returns {Promise<string|null>}
     */
  function resolveDocumentationInterwiki (imp) {
    try {
      // Only attempt for local or cross-wiki script pages
      if (imp.type === 2) return Promise.resolve(null)
      const host = (imp.type === 1 && imp.wiki) ? (imp.wiki + '.org') : mw.config.get('wgServerName')
      const title = imp.page
      if (!host || !title) return Promise.resolve(null)
      const rawUrl = '//' + host + '/w/index.php?title=' + encodeURIComponent(title) + '&action=raw&ctype=text/javascript'
      return fetch(rawUrl).then(function (r) {
        return r.ok ? r.text() : Promise.reject() 
      }).then(function (text) {
        // Look for leading comment Documentation: URL
        const head = text.slice(0, 2000) // scan first ~2KB
        const m = /Documentation:\s*(\S+)/.exec(head)
        if (m && m[1]) {
          const iw = urlToInterwiki(m[1])
          return iw || null
        }
        return null
      }).catch(function () {
        return null 
      })
    } catch (_) {
      return Promise.resolve(null) 
    }
  }

  /**
     * Build page title for summaries with proper interwiki prefix rules
     * @param {object} imp createImport instance
     * @returns {string}
     */
  function buildSummaryLinkTitle (imp) {
    try {
      const page = imp.page
      if (!page) return ''
      // Prefer documentation override if available on the instance
      if (imp.docInterwiki && typeof imp.docInterwiki === 'string') {
        return imp.docInterwiki
      }
      // Cross-wiki: prefix unless same as target wiki
      if (imp.type === 1 && imp.wiki) {
        const currentFrag = getTargetWikiFragment(imp.target)
        const sourceFrag = String(imp.wiki).toLowerCase()
        const same = !!currentFrag && (currentFrag.indexOf(sourceFrag) === 0 || sourceFrag.indexOf(currentFrag) === 0)
        if (!same) {
          const pref = getProjectPrefix(imp.wiki)
          if (pref) return pref + ':' + page
        }
        return page
      }
      // Global target for local source: prefix with current project
      if (imp.target === 'global' && imp.type !== 1) {
        const curFrag = getCurrentWikiFragment()
        const curPref = getProjectPrefix(curFrag)
        if (curPref) return curPref + ':' + page
      }
      return page
    } catch (_) {
      return imp && imp.page ? imp.page : '' 
    }
  }

  /**
     * Constructs an Import. An Import is a line in a JS file that imports a
     * user script.
     *
     * - page: page name (e.g., "User:Foo/Bar.js")
     * - wiki: wiki host prefix (e.g., "en.wikipedia") for cross-wiki
     * - url: absolute URL for loader.load
     * - target: user subpage without extension (e.g., "common")
     * - disabled: whether line is commented with //
     * - type: 0 local, 1 cross-wiki, 2 url
     */
  function createImport ( page, wiki, url, target, disabled ) {
    this.page = page
    this.wiki = wiki
    this.url = url
    this.target = target
    this.disabled = disabled
    this.type = this.url ? 2 : ( this.wiki ? 1 : 0 )
  }

  createImport.ofLocal = function ( page, target, disabled ) {
    if ( disabled === undefined ) disabled = false
    return new createImport( page, null, null, target, disabled )
  }

  /** URL to Import. Assumes wgScriptPath is "/w" */
  createImport.ofUrl = function ( url, target, disabled ) {
    if ( disabled === undefined ) disabled = false
    const URL_RGX = /^(?:https?:)?\/\/(.+?)\.org\/w\/index\.php\?.*?title=(.+?(?:&|$))/
    let match
    if ( match = URL_RGX.exec( url ) ) {
      const title = decodeURIComponent( match[2].replace( /&$/, '' ) ),
        wiki = decodeURIComponent( match[1] )
      return new createImport( title, wiki, null, target, disabled )
    }
    return new createImport( null, null, url, target, disabled )
  }

  /**
     * Parse a single line into Import if matches importScript or mw.loader.load
     * @param {string} line source line
     * @param {string} target target skin
     * @returns {Import|undefined}
     */
  createImport.fromJs = function ( line, target ) {
    const IMPORT_RGX = /^\s*(\/\/)?\s*importScript\s*\(\s*(['"])\s*(.+?)\s*\2\s*\)\s*;?/
    let match
    if ( match = IMPORT_RGX.exec( line ) ) {
      return createImport.ofLocal( unescapeForJsString( match[3] ), target, !!match[1] )
    }

    const LOADER_RGX = /^\s*(\/\/)?\s*mw\s*\.\s*loader\s*\.\s*load\s*\(\s*(['"])\s*(.+?)\s*\2\s*(?:,\s*(['"])\s*(?:text\/css|application\/css|text\/javascript|application\/javascript)\s*\4\s*)?\)\s*;?/
    if ( match = LOADER_RGX.exec( line ) ) {
      return createImport.ofUrl( unescapeForJsString( match[3] ), target, !!match[1] )
    }
  }

  createImport.prototype.getDescription = function ( useWikitext ) {
    switch ( this.type ) {
    case 0: {
      if (useWikitext) {
        const title0 = buildSummaryLinkTitle(this)
        return '[[' + title0 + ']]'
      }
      return this.page
    }
    case 1: {
      if (useWikitext) {
        const title1 = buildSummaryLinkTitle(this)
        return '[[' + title1 + ']]'
      }
      return SM_t('label-remote-url').replace( '$1', this.page ).replace( '$2', this.wiki )
    }
    case 2: return this.url
    }
  }

  /**
     * Serialize Import into canonical mw.loader.load statement
     * @returns {string}
     */
  createImport.prototype.toJs = function () {
    const dis = this.disabled ? '//' : ''
    const host = (function (self) {
      if (self.type === 1) return self.wiki + '.org' // cross-wiki explicit
      // For local scripts (type 0) always load from current wiki, even if installing to global
      return mw.config.get('wgServerName')
    })(this)
    const title = (this.type === 2 ? null : this.page)
    const url = (this.type === 2)
      ? this.url
      : buildRawLoaderUrl(host, title)
    const backlinkText = (this.target === 'global') ? STRINGS_EN['label-backlink'] : SM_t('label-backlink')

    const backlinkPage = buildSummaryLinkTitle(this)
    const suffix = (this.type === 2)
      ? ''
      : (' // ' + backlinkText + ' [[' + escapeForJsComment( backlinkPage ) + ']]')

    let isCss = false
    if (this.type === 2) {
      try {
        const urlForCheck = String(url || '').replace(/[?#].*$/, '')
        isCss = /\.css$/i.test(urlForCheck)
      } catch (_) {
        isCss = false 
      }
    } else {
      isCss = /\.css$/i.test(String(this.page||''))
    }
    const typeArg = isCss ? ', \'text/css\'' : ''
    return dis + 'mw.loader.load(\'' + escapeForJsString( url ) + '\'' + typeArg + ');' + suffix
  }

  /**
     * Installs the import.
     */
  createImport.prototype.install = function (options) {
    options = options || {}
    const targetApi = getApiForTarget( this.target )
    const self = this
    // Try to resolve Documentation iw for better summary link
    return resolveDocumentationInterwiki(this).then(function (iw) {
      if (iw) {
        try {
          self.docInterwiki = iw 
        } catch (_) {} 
      }
      const req = targetApi.postWithEditToken( {
        action: 'edit',
        title: getFullTarget( self.target ),
        summary: getSummaryForTarget( self.target, 'summary-install', self.getDescription( /* useWikitext */ true ) ),
        appendtext: '\n' + self.toJs()
      } )
      if (options.silent) return req
      return req.then(function () {
        showNotification('notification-install-success', 'success', self.getDescription())
      }).catch(function (error) {
        smError('Install failed:', error)
        showNotification('notification-install-error', 'error', self.getDescription())
        throw error
      })
    })
  }

  /**
     * Get all line numbers from the target page that mention
     * the specified script.
     */
  createImport.prototype.getLineNums = function ( targetWikitext ) {
    function quoted ( s ) {
      return new RegExp( '([\'"])' + escapeForRegex( s ) + '\\1' )
    }
    let toFind
    switch ( this.type ) {
    case 0: toFind = quoted( escapeForJsString( this.page ) ); break
    case 1: 
      // For cross-wiki scripts, try multiple patterns to find the script
      const pageName = this.page.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' ) // Escape regex special chars
      // Try exact match first
      toFind = new RegExp( pageName )
      smLog('getLineNums - type 1 exact pattern:', toFind, 'wiki:', this.wiki, 'page:', this.page)
      break
    case 2: toFind = quoted( escapeForJsString( this.url ) ); break
    }
    const lineNums = [], lines = targetWikitext.split( '\n' )
    for ( let i = 0; i < lines.length; i++ ) {
      if ( toFind.test( lines[i] ) ) {
        smLog('Found matching line', i, ':', lines[i])
        lineNums.push( i )
      }
    }
    smLog('getLineNums result:', lineNums)
    return lineNums
  }

  /**
     * Uninstalls the given import. That is, delete all lines from the
     * target page that import the specified script.
     */
  createImport.prototype.uninstall = function (options) {
    options = options || {}
    const that = this
    smInfo('uninstall: start', { page: that.page, target: that.target, type: that.type, wiki: that.wiki, url: that.url })
    const chain = resolveDocumentationInterwiki(this).then(function (iw) {
      if (iw) {
        try {
          that.docInterwiki = iw 
        } catch (_) {} 
      } 
    }).then(function () {
      return getWikitext( getFullTarget( that.target ) )
    }).then( function ( wikitext ) {
      try {
        smInfo('uninstall: fetched wikitext bytes=', (wikitext||'').length, 'target=', getFullTarget(that.target)) 
      } catch (_) {}
      // Parse lines semantically to find matching imports
      const srcLines = String(wikitext||'').split('\n')
      let lineNums = []
      try {
        for (let i = 0; i < srcLines.length; i++) {
          const parsed = createImport.fromJs(srcLines[i], that.target)
          if (!parsed) continue
          const pPage = (parsed.page||'').toLowerCase()
          const tPage = (that.page||'').toLowerCase()
          if (pPage && tPage && pPage === tPage) {
            lineNums.push(i); continue 
          }
          if (parsed.url && that.url && parsed.url === that.url) {
            lineNums.push(i) 
          }
        }
      } catch (e) {
        try {
          lineNums = that.getLineNums(wikitext) || [] 
        } catch (_) {
          lineNums = [] 
        }
      }
      const newWikitext = srcLines.filter(function (_, idx) {
        return lineNums.indexOf(idx) < 0 
      }).join('\n')
      smInfo('uninstall: lineNums to remove =', lineNums)
      return getApiForTarget( that.target ).postWithEditToken( {
        action: 'edit',
        title: getFullTarget( that.target ),
        summary: getSummaryForTarget( that.target, 'summary-uninstall', that.getDescription( /* useWikitext */ true ) ),
        text: newWikitext
      } ).then(function (resp) {
        // Verify removal actually happened
        try {
          return getWikitext( getFullTarget( that.target ) ).then(function (after) {
            const remaining = that.getLineNums(after)
            smInfo('uninstall: verify remaining lineNums =', remaining, 'target=', getFullTarget(that.target))
            if (remaining && remaining.length) {
              const err = new Error('Uninstall verification failed: lines remain')
              err.code = 'UNINSTALL_VERIFY_FAILED'
              throw err
            }
            return resp
          })
        } catch (e) {
          return resp 
        }
      })
    } )
    // Return value should be compatible with both jQuery Deferred and native Promise consumers
    const dfd = (typeof $ !== 'undefined' && $.Deferred) ? $.Deferred() : null
    const consume = function () {
      return chain.then(function () {
        if (!options.silent) {
          showNotification('notification-uninstall-success', 'success', that.getDescription()) 
        }
        if (dfd) dfd.resolve()
      }).catch(function (error) {
        smError('Uninstall failed:', error)
        if (!options.silent) {
          showNotification('notification-uninstall-error', 'error', that.getDescription()) 
        }
        if (dfd) dfd.reject(error)
        else throw error
      })
    }
    const p = consume()
    return dfd ? dfd.promise() : p
  }

  /**
     * Sets whether the given import is disabled, based on the provided
     * boolean value.
     */
  createImport.prototype.setDisabled = function ( disabled ) {
    const that = this
    this.disabled = disabled
    return resolveDocumentationInterwiki(this).then(function (iw) {
      if (iw) {
        try {
          that.docInterwiki = iw 
        } catch (_) {} 
      } 
    }).then(function () {
      return getWikitext( getFullTarget( that.target ) )
    }).then( function ( wikitext ) {
      // Parse lines semantically (handles encoded titles and second arg),
      // and preserve original indentation when toggling comments
      const newWikitextLines = wikitext.split( '\n' )
      let lineNums = []
      try {
        for (let i = 0; i < newWikitextLines.length; i++) {
          const parsed = createImport.fromJs(newWikitextLines[i], that.target)
          if (!parsed) continue
          const pPage = (parsed.page||'').toLowerCase()
          const tPage = (that.page||'').toLowerCase()
          if (pPage && tPage && pPage === tPage) {
            lineNums.push(i); continue 
          }
          if (parsed.url && that.url && parsed.url === that.url) {
            lineNums.push(i) 
          }
        }
      } catch (e) {
        try {
          lineNums = that.getLineNums(wikitext) || [] 
        } catch (_) {
          lineNums = [] 
        }
      }

      if ( disabled ) {
        lineNums.forEach( function ( lineNum ) {
          // If not already commented, add '//' after leading whitespace
          if ( !/^\s*\/\//.test(newWikitextLines[lineNum]) ) {
            newWikitextLines[lineNum] = newWikitextLines[lineNum].replace(/^(\s*)(?!\/\/)/, '$1//')
          }
        } )
      } else {
        lineNums.forEach( function ( lineNum ) {
          // If commented, remove a single leading '//'
          if ( /^\s*\/\//.test(newWikitextLines[lineNum]) ) {
            newWikitextLines[lineNum] = newWikitextLines[lineNum].replace(/^(\s*)\/\/\s?/, '$1')
          }
        } )
      }

      const summaryKey = disabled ? 'summary-disable' : 'summary-enable'
      const summary = getSummaryForTarget( that.target, summaryKey, that.getDescription( /* useWikitext */ true ) )
      return getApiForTarget( that.target ).postWithEditToken( {
        action: 'edit',
        title: getFullTarget( that.target ),
        summary,
        text: newWikitextLines.join( '\n' )
      } )
    } ).then(function () {
      const notificationKey = disabled ? 'notification-disable-success' : 'notification-enable-success'
      showNotification(notificationKey, 'success', that.getDescription())
    }).catch(function (error) {
      smError('Set disabled failed:', error)
      const notificationKey = disabled ? 'notification-disable-error' : 'notification-enable-error'
      showNotification(notificationKey, 'error', that.getDescription())
    })
  }

  createImport.prototype.toggleDisabled = function () {
    this.disabled = !this.disabled
    return this.setDisabled( this.disabled )
  }

  /**
     * Move this import to another file.
     */
  createImport.prototype.move = function ( newTarget ) {
    if ( this.target === newTarget ) return
    smLog('createImport.move - moving from', this.target, 'to', newTarget)
    const that = this
    const old = new createImport( this.page, this.wiki, this.url, this.target, this.disabled )
    this.target = newTarget
    smLog('createImport.move - calling install then uninstall')
    const self = this
    return resolveDocumentationInterwiki(this).then(function (iw) {
      if (iw) {
        try {
          self.docInterwiki = iw; old.docInterwiki = iw 
        } catch (_) {} 
      } 
    }).then(function () {
      return self.install({silent:true}).then(function () {
        return old.uninstall({silent:true})
      })
    }).then(function () {
      showNotification('notification-move-success', 'success', that.getDescription())
    }).catch(function (error) {
      smError('Move failed:', error)
      showNotification('notification-move-error', 'error', that.getDescription())
    })
  }

  function getAllTargetWikitexts () {
    const localSkins = SKINS.filter(function (skin) {
      return skin !== 'global' 
    })
    const localTitles = localSkins.map( getFullTarget ).join( '|' )
    const globalTitle = getFullTarget( 'global' )
        
    const localPromise = getApiForTitle(localTitles).get({
      action: 'query',
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      titles: localTitles
    })
        
    const globalPromise = getApiForTitle(globalTitle).get({
      action: 'query',
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      titles: globalTitle
    })
        
    return $.when(localPromise, globalPromise).then( function ( localData, globalData ) {
      const result = {}
      const extractFromPagesToTargets = function (pagesObj) {
        const out = {}
        if (!pagesObj) return out
        Object.values(pagesObj).forEach(function (page) {
          const nameWithoutExtension = new mw.Title( page.title ).getNameText()
          const targetName = nameWithoutExtension.substring( nameWithoutExtension.indexOf( '/' ) + 1 )
          out[targetName] = page.revisions ? page.revisions[0].slots.main['*'] : null
        })
        return out
      }

      const localPages = localData && localData.query && localData.query.pages ? localData.query.pages : 
        (localData && localData[0] && localData[0].query && localData[0].query.pages ? localData[0].query.pages : null)
      const globalPages = globalData && globalData.query && globalData.query.pages ? globalData.query.pages : 
        (globalData && globalData[0] && globalData[0].query && globalData[0].query.pages ? globalData[0].query.pages : null)
      Object.assign(result, extractFromPagesToTargets(localPages))
      Object.assign(result, extractFromPagesToTargets(globalPages))
      return result
    } ).fail( function ( _ ) {
      // Fallback: try to load only local skins
      return api.get({
        action: 'query',
        prop: 'revisions',
        rvprop: 'content',
        rvslots: 'main',
        titles: SKINS.filter(function (skin) {
          return skin !== 'global' 
        }).map( getFullTarget ).join( '|' )
      }).then( function ( data ) {
        const result = {}
        if ( data && data.query && data.query.pages ) {
          Object.values( data.query.pages ).forEach( function ( moreData ) {
            const nameWithoutExtension = new mw.Title( moreData.title ).getNameText()
            const targetName = nameWithoutExtension.substring( nameWithoutExtension.indexOf( '/' ) + 1 )
            result[targetName] = moreData.revisions ? moreData.revisions[0].slots.main['*'] : null
          } )
        }
        return result
      } )
    } )
  }

  function extractWikitextFromResponse (resp) {
    const data = resp && resp.query ? resp : (resp && resp[0] && resp[0].query ? resp[0] : null)
    if (!data || !data.query || !data.query.pages) return null
    const page = Object.values(data.query.pages)[0]
    return page && page.revisions ? page.revisions[0].slots.main['*'] : null
  }

  function getWikitextForTarget (target) {
    const title = getFullTarget(target)
    return getWikitext(title).then(function (text) {
      return text || null 
    })
  }

  let _pBuildImportList = null
  // Helper: run factory once API is ready; if already ready, run immediately
  function whenApiReadyThen (factory) {
    try {
      if (typeof SM_API_READY !== 'undefined' && typeof SM_waitApiReady === 'function' && !SM_API_READY) {
        return new Promise(function (resolve, reject) {
          try {
            SM_waitApiReady(function () {
              try {
                factory().then ? factory().then(resolve).catch(reject) : resolve(factory()) 
              } catch (e) {
                reject(e) 
              }
            })
          } catch (e) {
            reject(e) 
          }
        })
      }
    } catch (_) {}
    try {
      return factory() 
    } catch (e) {
      return Promise.reject(e) 
    }
  }
  /**
     * Build imports index per target by parsing user JS pages
     * @returns {JQueryPromise<void>|Promise<void>}
     */
  const importsLoadedTargets = {}
  function _withBuildImportListCleanup (p) {
    try {
      if (p && typeof p.always === 'function') {
        p.always(function () {
          _pBuildImportList = null 
        })
      } else if (p && typeof p.finally === 'function') {
        p.finally(function () {
          _pBuildImportList = null 
        })
      } else if (p && typeof p.then === 'function') {
        p.then(function () {
          _pBuildImportList = null 
        }, function () {
          _pBuildImportList = null 
        })
      } else {
        _pBuildImportList = null
      }
    } catch (_) {
      _pBuildImportList = null 
    }
    return p
  }

  function buildImportList (targets) {
    if (_pBuildImportList) return _pBuildImportList
    _pBuildImportList = _withBuildImportListCleanup(
      whenApiReadyThen(function () {
        if (Array.isArray(targets) && targets.length > 0) {
          // Load subset of targets
          const tasks = targets.map(function (t) {
            return getWikitextForTarget(t).then(function (text) {
              return { target: t, text } 
            }) 
          })
          return Promise.all(tasks).then(function (results) {
            results.forEach(function (entry) {
              const targetName = entry.target
              const targetImports = []
              if (entry.text) {
                const lines = entry.text.split('\n')
                let currentImport
                for (let i = 0; i < lines.length; i++) {
                  if (currentImport = createImport.fromJs(lines[i], targetName)) {
                    targetImports.push(currentImport)
                  }
                }
              }
              imports[targetName] = targetImports
              importsLoadedTargets[targetName] = true
            })
            if (importsRef) {
              try {
                (typeof requestAnimationFrame==='function'?requestAnimationFrame:setTimeout)(function () {
                  importsRef.value = Object.assign({}, imports)
                }, 0)
              } catch (_) {
                importsRef.value = Object.assign({}, imports) 
              }
            }
          })
        }
        // Default: load all
        return getAllTargetWikitexts().then(function ( wikitexts ) {
          const nextImports = {}
          Object.keys( wikitexts ).forEach( function ( targetName ) {
            const targetImports = []
            if ( wikitexts[ targetName ] ) {
              const lines = wikitexts[ targetName ].split( '\n' )
              let currentImport
              for ( let i = 0; i < lines.length; i++ ) {
                if ( currentImport = createImport.fromJs( lines[i], targetName ) ) {
                  targetImports.push( currentImport )
                }
              }
            }
            nextImports[ targetName ] = targetImports
            importsLoadedTargets[targetName] = true
          } )

          imports = nextImports
          if (importsRef) {
            try {
              (typeof requestAnimationFrame==='function'?requestAnimationFrame:setTimeout)(function () {
                importsRef.value = Object.assign({}, nextImports)
              }, 0)
            } catch (_) {
              importsRef.value = Object.assign({}, nextImports) 
            }
          }
        })
      })
    )
    return _pBuildImportList
  }

  function ensureImportsForTarget (target) {
    if (importsLoadedTargets[target]) return Promise.resolve()
    return buildImportList([target])
  }
  function ensureAllImports () {
    // If any target not yet loaded, fetch all remaining
    const missing = SKINS.filter(function (s) {
      return !importsLoadedTargets[s] 
    })
    if (missing.length === 0) return Promise.resolve()
    return buildImportList(missing)
  }

  let _pLoadGadgets = null
  /**
     * Load gadgets metadata
     * @returns {JQueryPromise<object>|Promise<object>}
     */
  function loadGadgets () {
    if (_pLoadGadgets) return _pLoadGadgets
    smInfo('loadGadgets: start')
    const t0 = (typeof performance!=='undefined'&&performance.now)?performance.now():Date.now()
    _pLoadGadgets = api.get({
      action: 'query',
      list: 'gadgets',
      gaprop: 'id|desc|metadata',
      format: 'json'
    }).then(function (data) {
      if (data && data.query && data.query.gadgets) {
        // Convert array to object format, filtering out hidden gadgets
        gadgetsData = {}
        data.query.gadgets.forEach(function (gadget) {
          // Skip hidden gadgets (only show gadgets that don't have hidden property)
          if (gadget.metadata && gadget.metadata.settings && 'hidden' in gadget.metadata.settings) {
            return
          }
                    
          // Get section for categorization
          let section = 'other'
          if (gadget.metadata && gadget.metadata.settings && gadget.metadata.settings.section) {
            section = gadget.metadata.settings.section
          }
                    
          // Check if gadget is enabled by default
          const isDefault = gadget.metadata && gadget.metadata.settings && 
                                   gadget.metadata.settings.default === ''
                    
          gadgetsData[gadget.id] = {
            name: gadget.id,
            description: gadget.desc || SM_t('gadgets-no-description'),
            section,
            isDefault
          }
        })
        smInfo('loadGadgets: parsed count =', Object.keys(gadgetsData).length)
        return gadgetsData
      } else {
        gadgetsData = {}
        return gadgetsData
      }
    }).catch(function (error) {
      smError('Failed to load gadgets:', error)
      gadgetsData = {}
      return gadgetsData
    }).always(function () {
      const t1=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now(); smInfo('loadGadgets: done in', Math.round(t1-t0), 'ms'); _pLoadGadgets = null 
    })
    return _pLoadGadgets
  }


  function loadGadgetsLabel () {
    smInfo('loadGadgetsLabel: request prefs-gadgets')
    return api.get({
      action: 'query',
      meta: 'allmessages',
      ammessages: 'prefs-gadgets',
      format: 'json'
    }).then(function (msgData) {
      smLog('loadGadgetsLabel: response', msgData)
      if (msgData.query && msgData.query.allmessages && msgData.query.allmessages[0] && msgData.query.allmessages[0]['*']) {
        const label = msgData.query.allmessages[0]['*']
        smInfo('loadGadgetsLabel: label =', label)
        return label
      } else {
        smWarn('loadGadgetsLabel: not found, fallback')
        return 'Gadgets' // Fallback
      }
    }).catch(function () {
      smWarn('loadGadgetsLabel: error, fallback')
      return 'Gadgets' // Fallback
    })
  }

  function loadSectionLabels () {
    // Get unique sections from loaded gadgets
    const sections = new Set()
    Object.values(gadgetsData).forEach(function (gadget) {
      sections.add(gadget.section)
    })
    smLog('loadSectionLabels: sections =', Array.from(sections))
    // Filter out placeholder section
    const names = Array.from(sections).filter(function (s) {
      return s && s !== 'other' 
    }).map(function (s) {
      return 'gadget-section-' + s 
    })
    if (!names.length) return Promise.resolve({})

    // Fetch all labels in one request via allmessages
    smLog('loadSectionLabels: allmessages request keys =', names.join('|'))
    const t0 = (typeof performance!=='undefined'&&performance.now)?performance.now():Date.now()
    return api.get({
      action: 'query',
      meta: 'allmessages',
      ammessages: names.join('|'),
      format: 'json'
    }).then(function (msgData) {
      const map = {}
      try {
        const arr = (msgData && msgData.query && msgData.query.allmessages) ? msgData.query.allmessages : []
        arr.forEach(function (m) {
          const key = m && m.name ? m.name : ''
          const value = m && typeof m['*'] === 'string' && m['*'].trim() ? m['*'].trim() : ''
          if (!key) return
          // key format: gadget-section-<section>
          const section = key.replace(/^gadget-section-/, '')
          map[section] = value || (section.charAt(0).toUpperCase() + section.slice(1))
        })
      } catch (_) {}
      // Ensure all sections have a label
      Array.from(sections).forEach(function (s) {
        if (s && s !== 'other' && !map[s]) {
          map[s] = s.charAt(0).toUpperCase() + s.slice(1) 
        } 
      })
      smLog('loadSectionLabels: result keys =', Object.keys(map))
      return map
    }).catch(function (e) {
      smWarn('loadSectionLabels: error', e)
      // Fallback: capitalized keys
      const fallback = {}
      Array.from(sections).forEach(function (s) {
        if (s && s !== 'other') {
          fallback[s] = s.charAt(0).toUpperCase() + s.slice(1) 
        } 
      })
      return fallback
    }).always(function () {
      const t1=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now(); smLog('loadSectionLabels: done in', Math.round(t1-t0), 'ms') 
    })
  }

  let _pLoadUserGadgetSettings = null
  /**
     * Load user gadget options
     * @returns {JQueryPromise<object>|Promise<object>}
     */
  function loadUserGadgetSettings () {
    if (_pLoadUserGadgetSettings) return _pLoadUserGadgetSettings
    _pLoadUserGadgetSettings = api.get({
      action: 'query',
      meta: 'userinfo',
      uiprop: 'options'
    }).then(function (data) {
      const options = data.query.userinfo.options || {}
      userGadgetSettings = {}
            
      // Extract gadget settings
      Object.keys(options).forEach(function (key) {
        if (key.startsWith('gadget-')) {
          userGadgetSettings[key] = options[key]
        }
      })
            
      return userGadgetSettings
    }).catch(function (error) {
      smError('Failed to load user gadget settings:', error)
      userGadgetSettings = {}
      return {}
    }).always(function () {
      _pLoadUserGadgetSettings = null 
    })
    return _pLoadUserGadgetSettings
  }

  function toggleGadget (gadgetName, enabled) {
    return api.postWithToken('csrf', {
      action: 'options',
      optionname: 'gadget-' + gadgetName,
      optionvalue: enabled ? '1' : '0'
    }).then(function ( _ ) {
      // Update local settings
      userGadgetSettings['gadget-' + gadgetName] = enabled ? '1' : '0'
      return true
    }).catch(function (error) {
      smError('Failed to toggle gadget:', error)
      throw error
    })
  }

  /**
     * Normalize target page: rewrite imports to canonical mw.loader.load form
     * @param {string} target skin key ('common','vector', 'global', ...)
     * @returns {JQueryPromise<void>} resolves when edit completes
     */
  function normalize ( target ) {
    return getWikitext( getFullTarget( target ) ).then( function ( wikitext ) {
      const lines = wikitext.split( '\n' )
      const newLines = Array( lines.length )
      const importsToResolve = []
      const importAtIndex = []
      for (let i = 0; i < lines.length; i++) {
        const imp = createImport.fromJs( lines[i], target )
        if (imp) {
          importsToResolve.push( imp )
          importAtIndex.push( i )
        } else {
          newLines[i] = lines[i]
        }
      }
      // Resolve Documentation overrides for all detected imports (best-effort)
      const resolves = importsToResolve.map(function (imp) {
        return resolveDocumentationInterwiki(imp).then(function (iw) {
          if (iw) {
            try {
              imp.docInterwiki = iw 
            } catch (_) {} 
          } 
        })
      })
      return Promise.allSettled(resolves).then(function () {
        // Rebuild normalized lines using possibly enhanced backlink titles
        for (let j = 0; j < importsToResolve.length; j++) {
          const idx = importAtIndex[j]
          newLines[idx] = importsToResolve[j].toJs()
        }
        const summaryText = (function () {
          const base = getSummaryForTarget(target, 'summary-normalize', '')
          return base
        })()
        return getApiForTarget( target ).postWithEditToken( {
          action: 'edit',
          title: getFullTarget( target ),
          summary: summaryText,
          text: newLines.join( '\n' )
        } )
      })
    } ).then(function () {
      showNotification('notification-normalize-success', 'success')
    }).catch(function (error) {
      smError('Normalize failed:', error)
      showNotification('notification-normalize-error', 'error')
    })
  }

  function reloadAfterChange () {
    try {
      location.reload(true) 
    } catch (e) {
      smError('reloadAfterChange error', e) 
    }
  }

  // Refresh imports and update reactive view without full page reload
  function refreshImportsView () {
    try {
      const p = buildImportList()
      return toPromise(p).then(function () {
        try {
          if (importsRef) {
            importsRef.value = imports 
          } 
        } catch (_) {} 
      })
    } catch (e) {
      return Promise.resolve() 
    }
  }

  /********************************************
     *
     * Notification system
     *
     ********************************************/
  function getMessageStack () {
    let stack = document.getElementById('sm-message-stack')
    if (!stack) {
      stack = document.createElement('div')
      stack.id = 'sm-message-stack'
      stack.className = 'sm-message-stack'
      try {
        stack.setAttribute('aria-live', 'polite')
        stack.setAttribute('aria-atomic', 'true')
      } catch (_) {}
      document.body.appendChild(stack)
    }
    return stack
  }

  function showNotification (messageKeyOrText, type, param) {
    let message
    if (typeof messageKeyOrText === 'string') {
      // Localized message (with optional parameter) via SM_t
      const localized = (typeof t === 'function' ? t(messageKeyOrText) : (typeof SM_t === 'function' ? SM_t(messageKeyOrText) : messageKeyOrText))
      message = (param !== undefined && typeof localized === 'string') ? localized.replace('$1', param) : localized
    } else {
      message = messageKeyOrText
    }
        
    let status = 'notice'
    if (type === 'success') status = 'success'
    else if (type === 'warning') status = 'warning'
    else if (type === 'error') status = 'error'
        
    mw.loader.using(['vue', '@wikimedia/codex']).then(function () {
      try {
        const VueMod = mw.loader.require('vue')
        const CodexPkg = mw.loader.require('@wikimedia/codex')
                
        const createApp = VueMod.createApp || VueMod.createMwApp
        const CdxMessage = CodexPkg.CdxMessage || (CodexPkg.components && CodexPkg.components.CdxMessage)
                
        if (!createApp || !CdxMessage) {
          throw new Error('Codex components not available')
        }
                
        const stack = getMessageStack()
        const host = document.createElement('div')
        host.className = 'sm-message-host'
        try {
          if (status === 'error' || status === 'warning') {
            host.setAttribute('role', 'alert')
            host.setAttribute('aria-live', 'assertive')
          } else {
            host.setAttribute('role', 'status')
            host.setAttribute('aria-live', 'polite')
          }
        } catch (_) {}
        stack.appendChild(host)
                
        const app = createApp({
          data () { 
            return { 
              type: status, 
              message, 
              show: true 
            } 
          },
          template: '<transition name="sm-fade"><CdxMessage v-if="show" :type="type" :fade-in="true" :allow-user-dismiss="true" :auto-dismiss="true" :display-time="'+SM_NOTIFICATION_DISPLAY_TIME+'"><div v-html="message"></div></CdxMessage></transition>'
        })
                
        app.component('CdxMessage', CdxMessage)
        app.mount(host)
                
        setTimeout(function () { 
          try {
            app.unmount()
            if (host.parentNode) {
              host.parentNode.removeChild(host)
            }
          } catch (e) {}
        }, SM_NOTIFICATION_CLEANUP_DELAY)
      } catch (e) { 
        smError('showNotification error:', e) 
      }
    })
  }

  /********************************************
     *
     * UI code
     *
     ********************************************/
  function makePanel () {
    // Create container for Vue app
    const container = $( '<div>' ).attr( 'id', 'sm-panel' )
    smLog('makePanel: create container #sm-panel')
        
    // Load Vue and Codex
    loadVueCodex().then(function (libs) {
      smLog('makePanel: libs loaded, building panel')
      if (!libs.createApp || !libs.CdxDialog || !libs.CdxButton || !libs.CdxTextInput || !libs.CdxSelect || !libs.CdxField || !libs.CdxTabs || !libs.CdxTab || !libs.CdxToggleButton) {
        throw new Error('Codex/Vue components not available')
      }
      // Pass container[0] down so we can unmount exactly this root
      createVuePanel(container, libs.createApp, libs.defineComponent, libs.ref, libs.computed, libs.watch, libs.CdxDialog, libs.CdxButton, libs.CdxTextInput, libs.CdxSelect, libs.CdxField, libs.CdxTabs, libs.CdxTab, libs.CdxToggleButton)
    }).catch(function (error) {
      smError('Failed to load Vue/Codex:', error)
      container.html('<div class="error">Failed to load interface. Please refresh the page.</div>')
    })
        
    return container
  }

  function createVuePanel (container, createApp, defineComponent, ref, computed, watch, CdxDialog, CdxButton, CdxTextInput, CdxSelect, CdxField, CdxTabs, CdxTab, CdxToggleButton) {
    // Make imports reactive and set global reference
    smLog('createVuePanel: start')
    importsRef = ref(imports)
    const rootEl = container[0]
        
    let app // to unmount on close
    const ScriptManager = defineComponent({
      components: { CdxDialog, CdxButton, CdxTextInput, CdxSelect, CdxField, CdxTabs, CdxTab, CdxToggleButton },
      setup () {
        const dialogOpen = ref(true)
        const filterText = ref('')
        const selectedSkin = ref('common')
        const loadingStates = ref({})
        const removedScripts = ref([])
        const gadgetSectionLabels = ref(Object.assign({}, gadgetSectionLabelsVar || {}))
        const gadgetsLabel = ref(gadgetsLabelVar || 'Gadgets')
        try {
          gadgetSectionLabelsRef = gadgetSectionLabels; gadgetsLabelRef = gadgetsLabel 
        } catch (_) {}
        const enabledOnly = ref(false)
        const reloadOnClose = ref(false)
        const isNormalizing = ref(false)
        const normalizeCompleted = ref(false)

        try {
          if (watch) {
            watch(dialogOpen, function (v) {
              smLog('Panel: dialogOpen changed ->', v, 'reloadOnClose=', reloadOnClose.value)
              if (v === false) {
                if (reloadOnClose.value) {
                  reloadOnClose.value = false; (typeof requestAnimationFrame==='function'?requestAnimationFrame:setTimeout)(function () {
                    reloadAfterChange() 
                  }, 0) 
                }
                // immediate unmount/remove just like maintenance-core
                try {
                  safeUnmount(app, rootEl) 
                } catch (e) {
                  smLog('Panel: safeUnmount error', e) 
                }
              }
            })
          }
        } catch (e) {
          smLog('watch(dialogOpen) failed', e) 
        }

        const onPanelClose = function () {
          smLog('Panel: close button clicked')
          dialogOpen.value = false
        }

        // Create skin tabs
        const skinTabs = computed(function () {
          return [
            { name: 'gadgets', label: gadgetsLabel.value },
            { name: 'all', label: SM_t('skin-all') },
            { name: 'global', label: 'global' },
            { name: 'common', label: 'common' }             
          ].concat(SKINS.filter(function (skin) {
            return skin !== 'common' && skin !== 'global' 
          }).map(function (skin) {
            return { name: skin, label: skin }
          }))
        })
        try {
          selectedSkin.value = SM_DEFAULT_SKIN 
        } catch (_) {}
                
        const isSelectedTargetLoaded = computed(function () {
          try {
            if (!importsRef || !importsRef.value) return false
            const tab = selectedSkin.value
            if (tab === 'gadgets') return !!SM_GADGETS_READY
            if (tab === 'all') return Object.keys(importsRef.value || {}).length > 0
            return Object.prototype.hasOwnProperty.call(importsRef.value, tab)
          } catch (_) {
            return false 
          }
        })
                
        const filteredImports = computed(function () {
          // establish reactive deps on labels so updates retrigger rerender
          try {
            void gadgetSectionLabels.value; void gadgetsLabel.value 
          } catch (_) {}
          const result = {}
                    
          // Handle gadgets tab separately
          if (selectedSkin.value === 'gadgets') {
            // Group gadgets by section
            const groupedGadgets = {}
            Object.keys(gadgetsData).forEach(function (gadgetName) {
              const gadget = gadgetsData[gadgetName]
              const section = gadget.section || 'other'
                            
              // Filter by enabledOnly if enabled
              if (enabledOnly.value && !isGadgetEnabled(gadgetName)) {
                return
              }
                            
              if (!groupedGadgets[section]) {
                groupedGadgets[section] = {}
              }
              groupedGadgets[section][gadgetName] = gadget
            })
                        
            // Get section order from loaded data
            const sectionOrder = gadgetSectionOrderVar || []
                        
            // Sort sections according to loaded order
            const sortedSections = sectionOrder.filter(function (section) {
              return groupedGadgets[section]
            })
                        
            // Add any remaining sections not in the order
            Object.keys(groupedGadgets).forEach(function (section) {
              if (sortedSections.indexOf(section) === -1) {
                sortedSections.push(section)
              }
            })
            sortedSections.forEach(function (section) {
              const sectionGadgets = groupedGadgets[section]
              const sortedGadgets = {}
              Object.keys(sectionGadgets).sort().forEach(function (gadgetName) {
                sortedGadgets[gadgetName] = sectionGadgets[gadgetName]
              })
              result[section] = {
                gadgets: sortedGadgets,
                label: section.charAt(0).toUpperCase() + section.slice(1) // Temporary label
              }
            })
                        
            return result
          }
                    
          if (importsRef.value) {
            // Define the order: common first, then global, then others
            const orderedKeys = ['common', 'global']
            const allKeys = Object.keys(importsRef.value)
                        
            // Add other keys (excluding common and global) in alphabetical order
            allKeys.filter(function (key) { 
              return key !== 'common' && key !== 'global' 
            }).sort().forEach(function (key) {
              orderedKeys.push(key)
            })
                        
            orderedKeys.forEach(function (targetName) {
              if (!importsRef.value[targetName]) return
                            
              // Filter by selected skin
              if (selectedSkin.value !== 'all') {
                if (selectedSkin.value !== targetName) {
                  return
                }
              }
                            
              let targetImports = importsRef.value[targetName]
              if (targetImports && targetImports.length > 0) {
                // Filter by enabledOnly if enabled
                if (enabledOnly.value) {
                  targetImports = targetImports.filter(function (anImport) {
                    return !anImport.disabled
                  })
                }
                                
                if (filterText.value && filterText.value.trim()) {
                  const filtered = targetImports.filter(function (anImport) {
                    return anImport.getDescription().toLowerCase().indexOf(filterText.value.toLowerCase()) >= 0
                  })
                  if (filtered.length > 0) {
                    result[targetName] = filtered
                  }
                } else {
                  result[targetName] = targetImports
                }
              }
            })
          }
                    
          return result
        })
                
        const setLoading = function (key, value) {
          loadingStates.value[key] = value
        }

        // Lazy load per tab
        if (watch) {
          watch(selectedSkin, function (newTab) {
            if (!newTab) return
            if (newTab === 'gadgets') {
              // Load gadgets metadata and labels on demand
              if (!SM_GADGETS_READY && !SM_GADGETS_LOADING) {
                SM_GADGETS_LOADING = true
                loadGadgets().then(function () {
                  return Promise.all([ loadSectionLabels(), loadGadgetsLabel() ]) 
                })
                  .then(function (results) {
                    applyGadgetLabels(results[0], results[1])
                    SM_GADGETS_READY = true
                  }).catch(function () {
                    SM_GADGETS_READY = true 
                  })
              }
              // Also load user gadget settings on demand
              if (!_pLoadUserGadgetSettings) {
                loadUserGadgetSettings() 
              }
            } else if (newTab === 'all') {
              // Ensure all imports are loaded
              ensureAllImports()
            } else {
              // Ensure imports for specific target
              ensureImportsForTarget(newTab)
            }
          }, { immediate: true })
        }
                
        const handleNormalize = function (targetName) {
          const key = 'normalize-' + targetName
          setLoading(key, true)
          normalize(targetName).done(function () {
            reloadOnClose.value = true
          }).fail(function (error) {
            smError('Failed to normalize:', error)
            showNotification('notification-normalize-error', 'error')
          }).always(function () {
            setLoading(key, false)
          })
        }
                
        const handleUninstall = function (anImport) {
          const key = 'uninstall-' + anImport.getDescription()
          const scriptName = anImport.getDescription()
          const isRemoved = removedScripts.value.includes(scriptName)
                    
          setLoading(key, true)
                    
          if (isRemoved) {
            // Restore script
            const pRestore = toPromise(anImport.install())
            pRestore
              .then(function () {
                const index = removedScripts.value.indexOf(scriptName)
                if (index > -1) removedScripts.value.splice(index, 1)
                reloadOnClose.value = true
              })
              .catch(function (error) {
                smError('Failed to restore:', error)
                showNotification('notification-restore-error', 'error', anImport.getDescription())
              })
            if (pRestore && typeof pRestore.finally === 'function') {
              pRestore.finally(function () {
                setLoading(key, false) 
              }) 
            } else {
              setLoading(key, false) 
            }
          } else {
            // Remove script
            const pUn = toPromise(anImport.uninstall())
            pUn
              .then(function () {
                removedScripts.value.push(scriptName)
                reloadOnClose.value = true
              })
              .catch(function (error) {
                smError('Failed to uninstall:', error)
                showNotification('notification-uninstall-error', 'error', anImport.getDescription())
              })
            if (pUn && typeof pUn.finally === 'function') {
              pUn.finally(function () {
                setLoading(key, false) 
              }) 
            } else {
              setLoading(key, false) 
            }
          }
        }
                
        const handleToggleDisabled = function (anImport) {
          try {
            // Normalize to ensure we have a proper createImport instance
            if (!(anImport instanceof createImport) || typeof anImport.toggleDisabled !== 'function') {
              const page = (anImport && (anImport.page || anImport.name || anImport.title)) || ''
              const target = (anImport && anImport.target) || SM_DEFAULT_SKIN
              const disabled = !!(anImport && anImport.disabled)
              const wiki = anImport && anImport.wiki
              const url = anImport && anImport.url
              anImport = url ? createImport.ofUrl(url, target, disabled) : (wiki ? new createImport(page, wiki, null, target, disabled) : createImport.ofLocal(page, target, disabled))
            }
          } catch (_) {}
          const key = 'toggle-' + anImport.getDescription()
          setLoading(key, true)
          try {
            const pToggle = toPromise(anImport.toggleDisabled())
            pToggle
              .then(function () {
                reloadOnClose.value = true 
              })
              .catch(function (error) {
                smError('Failed to toggle disabled state:', error); showNotification('notification-general-error', 'error') 
              })
            if (pToggle && typeof pToggle.finally === 'function') {
              pToggle.finally(function () {
                setLoading(key, false) 
              }) 
            } else {
              setLoading(key, false) 
            }
          } catch (e) {
            smError('toggleDisabled threw', e)
            setLoading(key, false)
          }
        }
                
        const handleMove = function (anImport) {
          showMoveDialog(anImport)
          // Reload will be triggered by move dialog itself; but also reload after closing main panel if further actions occurred
        }
                
        const handleNormalizeAll = function () {
          const targets = Object.keys(filteredImports.value)
          if (targets.length === 0 || isNormalizing.value) return
                    
          isNormalizing.value = true
          normalizeCompleted.value = false
                    
          const normalizePromises = targets.map(function (targetName) {
            const key = 'normalize-' + targetName
            setLoading(key, true)
            const p = toPromise(normalize(targetName))
            if (p && typeof p.finally === 'function') {
              p.finally(function () {
                setLoading(key, false) 
              }) 
            } else {
              p.then(function () {
                setLoading(key, false) 
              }, function () {
                setLoading(key, false) 
              }) 
            }
            return p
          })
                    
          Promise.all(normalizePromises).then(function () {
            normalizeCompleted.value = true
            reloadOnClose.value = true
          }).catch(function (error) {
            smError('Failed to normalize some scripts:', error)
            showNotification('notification-normalize-error', 'error')
          }).finally ? Promise.all(normalizePromises).finally(function () {
              isNormalizing.value = false 
            }) : (function () {
              isNormalizing.value = false 
            })()
        }

        const handleGadgetToggle = function (gadgetName, enabled) {
          const key = 'gadget-' + gadgetName
          setLoading(key, true)
                    
          toggleGadget(gadgetName, enabled).then(function () {
            showNotification('Gadget ' + gadgetName + ' ' + (enabled ? 'enabled' : 'disabled'), 'success')
            reloadOnClose.value = true
          }).catch(function (error) {
            smError('Failed to toggle gadget:', error)
            showNotification('Failed to toggle gadget', 'error')
          }).always(function () {
            setLoading(key, false)
          })
        }

        const isGadgetEnabled = function (gadgetName) {
          // Check if gadget is explicitly enabled in user settings
          if (userGadgetSettings['gadget-' + gadgetName] === '1') {
            return true
          }
                    
          // Check if gadget is disabled in user settings
          if (userGadgetSettings['gadget-' + gadgetName] === '0') {
            return false
          }
                    
          // If not in user settings, check if it's enabled by default
          const gadget = gadgetsData[gadgetName]
          if (gadget && gadget.isDefault) {
            return true
          }
                    
          return false
        }
                
        const getSkinUrl = function (skinName) {
          if (skinName === 'global') {
            return 'https://meta.wikimedia.org/wiki/User:' + mw.config.get('wgUserName') + '/global.js'
          } else {
            return 'https://' + mw.config.get('wgServerName') + '/wiki/User:' + mw.config.get('wgUserName') + '/' + skinName + '.js'
          }
        }
        const getImportHumanUrl = function (anImport) {
          const page = canonicalizeUserNamespace(anImport.page)
          if (anImport.type === 0) return '/wiki/' + encodeURI(page)
          if (anImport.type === 1) return '//' + anImport.wiki + '.org/wiki/' + encodeURI(page)
          return anImport.url
        }
                
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
          SKINS,
          mw,
          onPanelClose
        }
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
                        <!-- Gadgets tab -->
                        <template v-if="selectedSkin === 'gadgets'">
                            <div class="gadgets-section">
                                <div v-if="Object.keys(filteredImports).length === 0" class="no-gadgets">
                                    <p v-text="SM_t('gadgets-not-available')"></p>
                                    <p v-text="SM_t('gadgets-this-might-be-because')"></p>
                                    <ul>
                                        <li v-text="SM_t('gadgets-not-installed')"></li>
                                        <li v-text="SM_t('gadgets-not-configured')"></li>
                                        <li v-text="SM_t('gadgets-api-restricted')"></li>
                                    </ul>
                                </div>
                                <div v-else class="gadgets-list">
                                    <div v-for="(sectionData, sectionName) in filteredImports" :key="sectionName" class="gadget-section">
                                        <h4 class="gadget-section-title" v-text="gadgetSectionLabels[sectionName] || sectionData.label"></h4>
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
                                        <a :href="getImportHumanUrl(anImport)" class="script-link" v-text="anImport.getDescription()"></a>
                                    </div>
                                    
                                    <div class="script-actions">                                        
                                        <cdx-button 
                                            weight="quiet" 
                                            size="small"
                                            :disabled="loadingStates['toggle-' + anImport.getDescription()]"
                                            @click="handleToggleDisabled(anImport)"
                                        >
                                            <span v-text="loadingStates['toggle-' + anImport.getDescription()] ? '...' : (anImport.disabled ? SM_t('action-enable') : SM_t('action-disable'))"></span>
                                        </cdx-button>
                                        
                                        <cdx-button 
                                            weight="quiet" 
                                            size="small"
                                            :disabled="loadingStates['move-' + anImport.getDescription()]"
                                            @click="handleMove(anImport)"
                                        >
                                            <span v-text="loadingStates['move-' + anImport.getDescription()] ? '...' : SM_t('action-move')"></span>
                                        </cdx-button>

                                        <cdx-button 
                                            action="destructive"
                                            weight="quiet" 
                                            size="small"
                                            :disabled="loadingStates['uninstall-' + anImport.getDescription()]"
                                            @click="handleUninstall(anImport)"
                                        >
                                            <span v-text="loadingStates['uninstall-' + anImport.getDescription()] ? '...' : (removedScripts.includes(anImport.getDescription()) ? SM_t('action-restore') : SM_t('action-uninstall'))"></span>
                                        </cdx-button>
                                    </div>
                                </cdx-card>
                            </div>
                        </div>
                        </template>
                        </template>
                    </div>
                    
                    <div class="sm-dialog-module">
                        <div class="sm-bottom-left">
                            <!-- Empty left side for now -->
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
    })
        
    try {
      app = createApp(ScriptManager)
      try {
        if (app && app.config && app.config.compilerOptions) {
          app.config.compilerOptions.delimiters = ['[%', '%]'] 
        } 
      } catch (_) {}
      const mountedApp = app.mount(rootEl)
      // keep internal reference for reactive updates from async loaders
      scriptInstallerVueComponent = mountedApp
      // Ensure labels/section titles are visible on first render (non-js/css pages)
      try {
        (typeof requestAnimationFrame==='function'?requestAnimationFrame:setTimeout)(function () {
          try {
            const comp = scriptInstallerVueComponent
            if (comp && comp.gadgetSectionLabels && typeof comp.gadgetSectionLabels === 'object' && 'value' in comp.gadgetSectionLabels) {
              comp.gadgetSectionLabels.value = gadgetSectionLabelsVar || {}
            }
            if (comp && comp.gadgetsLabel && typeof comp.gadgetsLabel === 'object' && 'value' in comp.gadgetsLabel) {
              comp.gadgetsLabel.value = gadgetsLabelVar || 'Gadgets'
            }
          } catch (_) {}
        }, 0)
      } catch (_) {}
      smLog('createVuePanel: mounted')
    } catch (error) {
      smError('Error mounting Vue app:', error)
      container.html('<div class="error">Error creating Vue component: ' + error.message + '</div>')
    }
  }

  function buildCurrentPageInstallElement () {
    let addingInstallLink = false // will we be adding a legitimate install link?
    const installElement = $( '<span>' ) // only used if addingInstallLink is set to true

    const namespaceNumber = mw.config.get( 'wgNamespaceNumber' )
    const pageName = mw.config.get( 'wgPageName' )

    // Namespace 2 is User
    if ( namespaceNumber === SM_USER_NAMESPACE_NUMBER &&
                pageName.indexOf( '/' ) > 0 ) {
      const contentModel = mw.config.get( 'wgPageContentModel' )
      const isCodeModel = (contentModel === 'javascript' || contentModel === 'css' || contentModel === 'sanitized-css')
      if ( isCodeModel ) {
        const prefixLength = mw.config.get( 'wgUserName' ).length + USER_NAMESPACE_NAME.length + 1
        if ( pageName.indexOf( USER_NAMESPACE_NAME + ':' + mw.config.get( 'wgUserName' ) ) === 0 ) {
          const nameWithoutNs = pageName.substring( prefixLength )
          const baseSkinName = nameWithoutNs.replace(/\.(?:js|css)$/i, '')
          const skinIndex = SKINS.indexOf( baseSkinName )
          if ( skinIndex >= 0 ) {
            return $( '<abbr>' ).text( SM_t('error-cannot-install') )
              .attr( 'title', SM_t('error-cannot-install-skin') )
          }
        }
        addingInstallLink = true
      } else {
        return $( '<abbr>' ).text( SM_t('error-cannot-install') + ' (' + SM_t('error-not-javascript') + ')' )
          .attr( 'title', SM_t('error-cannot-install-content-model').replace( '$1', contentModel ) )
      }
    }

    // Namespace 8 is MediaWiki
    if ( namespaceNumber === SM_MEDIAWIKI_NAMESPACE_NUMBER ) {
      return $( '<a>' ).text( SM_t('error-install-via-preferences') )
        .attr( 'href', mw.util.getUrl( 'Special:Preferences' ) + '#mw-prefsection-gadgets' )
    }

    const editRestriction = mw.config.get( 'wgRestrictionEdit' ) || []
    if ( ( namespaceNumber !== SM_USER_NAMESPACE_NUMBER && namespaceNumber !== SM_MEDIAWIKI_NAMESPACE_NUMBER ) &&
            ( editRestriction.indexOf( 'sysop' ) >= 0 ||
                editRestriction.indexOf( 'editprotected' ) >= 0 ) ) {
      installElement.append( ' ',
        $( '<abbr>' ).append(
          $( '<img>' ).attr( 'src', 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Achtung-yellow.svg/20px-Achtung-yellow.svg.png' ).addClass( 'warning' ),
          SM_t('error-insecure') )
          .attr( 'title', SM_t('error-temp-warning') ) )
      addingInstallLink = true
    }

    if ( addingInstallLink ) {
      const fixedPageName = mw.config.get( 'wgPageName' ).replace( /_/g, ' ' )
      const installedTargets = getTargetsForScript(fixedPageName)
      installElement.prepend( $( '<a>' )
        .attr( 'id', 'script-installer-main-install' )
        .text( installedTargets.length ? SM_t('action-uninstall') : SM_t('action-install') )
        .click( makeLocalInstallClickHandler( fixedPageName ) ) )

      // If the script is installed but disabled, allow the user to enable it
      const allScriptsInTarget = (importsRef && importsRef.value) ? importsRef.value[ installedTargets ] : imports[ installedTargets ]
      const importObj = allScriptsInTarget && allScriptsInTarget.find( function ( anImport ) {
        return anImport.page === fixedPageName 
      } )
      if ( importObj && importObj.disabled ) {
        installElement.append( ' | ',
          $( '<a>' )
            .attr( 'id', 'script-installer-main-enable' )
            .text( SM_t('action-enable') )
            .click( function () {
              $( this ).text( SM_t('action-enable-progress') )
              importObj.setDisabled( false ).done( function () {
                reloadAfterChange()
              } )
            } ) )
      }
      return installElement
    }

    return $( '<abbr>' ).text( SM_t('error-cannot-install') + ' ' + SM_t('error-insecure') )
      .attr( 'title', SM_t('error-bad-page') )
  }

  function showUi () {
    if ( !document.getElementById( 'sm-top-container' ) ) {
      const fixedPageName = mw.config.get( 'wgPageName' ).replace( /_/g, ' ' )
      try {
        const sub = document.getElementById('contentSub'); if (sub) sub.classList.add('sm-contentSub') 
      } catch (_) {}
      $( '#firstHeading' ).append( $( '<span>' )
        .attr( 'id', 'sm-top-container' )
        .append(
          (function () {
            const $btn = $( '<a>' )
              .attr( 'id', 'sm-manage-button' )
              .attr( 'title', SM_t('tooltip-manage-user-scripts') )
              .addClass( 'sm-manage-button' )
              .append(
                $( '<span class="sm-gear-icon"></span>' ),
              )
              .click( function () {
                const exists = !!document.getElementById( 'sm-panel' )
                smLog('showUi: Manage clicked; panel exists?', exists)
                if ( !exists ) {
                  smLog('showUi: mount panel')
                  $( '#mw-content-text' ).before( makePanel() )
                } else {
                  smLog('showUi: remove panel')
                  $( '#sm-panel' ).remove()
                }
                try {
                  $(this).toggleClass('open', !exists) 
                } catch (_) {}
              } );
            // Defer icon rendering until inserted
            (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : setTimeout)(function () {
              try {
                const gear = document.querySelector('#sm-manage-button .sm-gear-icon')
                if (gear) smRenderIconInto(gear, 'cdxIconSettings', 'currentColor', 16)
              } catch (e) {
                smLog('render icons failed', e) 
              }
            }, 0)
            return $btn
          })()
        ) )

      function injectInstallIndicator () {
        try {
          const $indRoot = $('#mw-indicators, .mw-indicators').first()
          if (!$indRoot || !$indRoot.length) return false
          // Gate using existing logic: create element and ensure install anchor exists
          const $installEl = buildCurrentPageInstallElement()
          const canInstall = ($installEl && $installEl.find && $installEl.find('#script-installer-main-install').length)
          if (!canInstall) return false
          let $slot = $('#mw-indicator-sm-install')
          if (!$slot.length) {
            $slot = $('<div id="mw-indicator-sm-install" class="mw-indicator"></div>').appendTo($indRoot) 
          }
          $slot.empty()

          // Mount a Codex button via helper for current page
          const host = $('<div id="sm-install-indicator-host"></div>')
          $slot.append(host)
          const scriptName = fixedPageName // current page
          mountInstallButton(host[0], scriptName)
          return true
        } catch (e) {
          smLog('mw-indicators injection failed', e); return false 
        }
      }
      // Try now; then via hook; then via observer as fallback
      const indicatorInjected = injectInstallIndicator()
      if (!indicatorInjected) {
        setTimeout(injectInstallIndicator, 100) 
      }
      try {
        if (mw && mw.hook && mw.hook('wikipage.content')) mw.hook('wikipage.content').add(function () {
          setTimeout(injectInstallIndicator, 0) 
        }) 
      } catch (_) {}
    }
  }

  // Helper to mount Codex Install/Uninstall button into a host element for given scriptName
  function mountInstallButton (hostEl, scriptName) {
    try {
      // Compute label; may update after imports load
      const computeLabel = function () {
        return getInitialInstallLabel(scriptName) 
      }
      const initialLabel = computeLabel()
      loadVueCodex().then(function (libs) {
        const app = libs.createApp({
          data () {
            return { label: initialLabel, busy: false } 
          },
          computed: {
            actionType () {
              return this.label === SM_t('action-install') ? 'progressive' : 'destructive' 
            }
          },
          methods: {
            onClick () {
              const vm = this
              smInfo('install button click', { busy: !!vm.busy, label: vm.label, scriptName })
              if (vm.busy) return; vm.busy=true; smInfo('install button set busy=true')
              if (vm.label === SM_t('action-install')) {
                const adapter = {
                  text (t) {
                    try {
                      vm.label = String(t); smLog('adapter.text set label', t) 
                    } catch (e) {} 
                  },
                  resetBusy () {
                    try {
                      vm.busy = false; smLog('adapter.resetBusy executed') 
                    } catch (e) {} 
                  }
                }
                try {
                  smInfo('opening install dialog for', scriptName); showInstallDialog(scriptName, adapter) 
                } catch (e) {
                  vm.busy=false; smError('showInstallDialog error', e) 
                }
              } else {
                vm.label = SM_t('action-uninstall-progress'); smInfo('uninstall start (from infobox button)', { scriptName, targets: getTargetsForScript(scriptName) })
                const targets = getTargetsForScript(scriptName)
                const uninstalls = uniques(targets).map(function (target) {
                  return toPromise(createImport.ofLocal(scriptName, target).uninstall()) 
                })
                Promise.all(uninstalls).then(function () {
                  smInfo('uninstall via button success', { scriptName, targets }); vm.label = SM_t('action-install'); return refreshImportsView() 
                })
                  .catch(function (e) {
                    smError('uninstall via button failed', e) 
                  })
                  .finally ? Promise.all(uninstalls).finally(function () {
                    vm.busy=false 
                  }) : (function () {
                    vm.busy=false 
                  })()
              }
            }
          },
          template: '<CdxButton :action="actionType" weight="primary" :disabled="busy" @click="onClick"><span v-text="label"></span></CdxButton>'
        })
        try {
          if (app && app.config && app.config.compilerOptions) {
            app.config.compilerOptions.delimiters = ['[%', '%]'] 
          } 
        } catch (_) {}
        app.component('CdxButton', libs.CdxButton)
        const mounted = app.mount(hostEl)
        // Refresh label once imports finished loading (first paint might precede it)
        try {
          if (typeof SM_waitImportsReady === 'function') {
            SM_waitImportsReady(function () {
              try {
                mounted.label = computeLabel() 
              } catch (_) {} 
            }) 
          } 
        } catch (_) {}
      })
    } catch (e) {
      smLog('mountInstallButton error', e) 
    }
  }

  // Ensure imports are fully known before deciding initial action, then mount button
  function mountInstallButtonAfterImports (hostEl, scriptName) {
    try {
      const proceed = function () {
        try {
          // Load all targets to detect any existing installs accurately
          buildImportList().then(function () {
            try {
              mountInstallButton(hostEl, scriptName) 
            } catch (e) {
              smLog('mount after imports failed', e) 
            }
          }).catch(function () {
            try {
              mountInstallButton(hostEl, scriptName) 
            } catch (_) {} 
          })
        } catch (e) {
          mountInstallButton(hostEl, scriptName) 
        }
      }
      if (typeof SM_waitApiReady === 'function') {
        SM_waitApiReady(proceed) 
      } else {
        proceed() 
      }
    } catch (e) {
      smLog('mountInstallButtonAfterImports error', e) 
    }
  }

  function attachInstallLinks () {
    // At the end of each {Userscript} transclusion, there is
    // <span id='User:Foo/Bar.js' class='scriptInstallerLink'></span>
    $( 'span.scriptInstallerLink' ).each( function () {
      const scriptName = this.id
      if ( $( this ).find( 'a' ).length === 0 ) {
        const installedTargets = getTargetsForScript(scriptName)
        $( this ).append( ' | ', $( '<a>' )
          .text( installedTargets.length ? SM_t('action-uninstall') : SM_t('action-install') )
          .click( makeLocalInstallClickHandler( scriptName ) ) )
      }
    } )

    $( 'table.infobox-user-script' ).each( function () {
      // Avoid duplicates if our host already exists
      if ( $( this ).find( '.sm-ibx-host' ).length ) return
      const $table = $(this)
      // Robust script name detection (priority: data-mainsource inside caption span.userscript-install-data)
      let scriptName = null
      try {
        const $data = $table.find('.userscript-install-data').first()
        if ($data && $data.length) {
          const mainSrc = $data.attr('data-mainsource') || $data.data('mainsource')
          if (mainSrc) {
            const s = String(mainSrc); let m
            if ((m = /[?&]title=([^&#]+)/i.exec(s))) scriptName = decodeURIComponent(m[1].replace(/\+/g, ' '))
            else if ((m = /\/wiki\/([^?#]+)/i.exec(s))) scriptName = decodeURIComponent(m[1]).replace(/_/g, ' ')
            else if (/^User:/i.test(s)) scriptName = s
          }
        }
      } catch (_) {}
      try {
        // Prefer link to User:*/*.js inside the infobox
        if (!scriptName) {
          const $lnk = $table.find('a[title*=\'User:\']').filter(function () {
            const t=this.getAttribute('title')||''; return /user:\\S+\/.+?\.js/i.test(t) 
          }).first()
          if ($lnk.length) {
            scriptName = $lnk.attr('title') 
          }
        }
      } catch (_) {}
      if (!scriptName) {
        try {
          // Try common localized headers
          const $th = $table.find('th:contains(\'Source\'), th:contains(\'Исход\'), th:contains(\'Источник\'), th:contains(\'Исходник\')').first()
          if ($th.length) {
            scriptName = ($th.next().text()||'').trim() 
          }
        } catch (_) {}
      }
      if (!scriptName) {
        scriptName = mw.config.get( 'wgPageName' ) 
      }
      try {
        const m2 = /user:.+?\/.+?\.js/i.exec( scriptName ); if (m2) {
          scriptName = m2[0] 
        } 
      } catch (_) {}

      // Prefer existing ScriptInstaller cell if present
      let $slot = $table.find('td.script-installer-ibx').last()
      if (!$slot.length) {
        // Otherwise create our own host row
        let $tbody = $table.children('tbody'); if (!$tbody.length) {
          $tbody = $table 
        }
        $slot = $tbody.append( $( '<tr>' ).append( $( '<td>' ).attr( 'colspan', '2' ).addClass( 'sm-ibx' ) ) ).find('td.sm-ibx')
      }
      const host = $( '<div class="sm-ibx-host"></div>' )
      $slot.append( host )
      mountInstallButtonAfterImports(host[0], scriptName)
    } )
  }

  function makeLocalInstallClickHandler ( scriptName ) {
    return function () {
      const $this = $( this )
      if ( $this.text() === SM_t('action-install') ) {
        // Show install dialog instead of confirm
        showInstallDialog( scriptName, $this )
      } else {
        $( this ).text( SM_t('action-uninstall-progress') )
        const targets = getTargetsForScript(scriptName)
        const uninstalls = uniques( targets )
          .map( function ( target ) {
            return createImport.ofLocal( scriptName, target ).uninstall() 
          } )
        $.when.apply( $, uninstalls ).then( function () {
          $( this ).text( SM_t('action-install') )
          reloadAfterChange()
        }.bind( this ) )
      }
    }
  }

  function showInstallDialog ( scriptName, buttonElement ) {
    // Create container for install dialog
    const container = $( '<div>' ).attr( 'id', 'sm-install-dialog' )
        
    // Load Vue and Codex for install dialog
    const open = function () {
      // Fail-safe: if dialog node disappears, make sure to reset busy on the opener
      let observer = null
      try {
        observer = new MutationObserver(function () {
          try {
            if (!document.getElementById('sm-install-dialog')) {
              if (buttonElement && typeof buttonElement.resetBusy === 'function') {
                buttonElement.resetBusy(); smLog('observer: resetBusy after dialog removal') 
              }
              if (observer) observer.disconnect()
            }
          } catch (_) {}
        })
        observer.observe(document.body, { childList: true, subtree: true })
      } catch (_) {}

      loadVueCodex().then(function (libs) {
        smInfo('showInstallDialog: libs loaded')
        if (!libs.createApp || !libs.CdxDialog || !libs.CdxButton || !libs.CdxSelect || !libs.CdxField) {
          throw new Error('Codex/Vue components not available for install dialog')
        }
        createInstallDialog(container, libs.createApp, libs.defineComponent, libs.ref, libs.CdxDialog, libs.CdxButton, libs.CdxSelect, libs.CdxField, scriptName, buttonElement)
      }).catch(function (error) {
        smError('Failed to load Vue/Codex for install dialog:', error)
        // Fallback to old confirm dialog
        const okay = window.confirm(
          SM_t('security-warning').replace( '$1',
            SM_t('security-warning-section').replace( '$1', scriptName ) ) )
        if ( okay ) {
          buttonElement.text( SM_t('action-install-progress') )
          const p0 = createImport.ofLocal( scriptName, SM_DEFAULT_SKIN ).install()
          if (p0 && typeof p0.then === 'function') {
            p0.then(function () {
              buttonElement.text( SM_t('action-uninstall') ); reloadAfterChange() 
            })
              .catch(function () {
                buttonElement.text( SM_t('action-install') ) 
              })
          } else if (p0 && typeof p0.done === 'function') {
            p0.done( function () {
              buttonElement.text( SM_t('action-uninstall') ); reloadAfterChange() 
            } )
              .fail(function () {
                buttonElement.text( SM_t('action-install') ) 
              })
          } else {
            buttonElement.text( SM_t('action-install') )
          }
        }
      }) 
    }
    try {
      if (typeof SM_waitI18n === 'function') {
        SM_waitI18n(open) 
      } else {
        open() 
      } 
    } catch (_) {
      open() 
    }
        
    // Add to body
    $('body').append(container)
  }

  function createInstallDialog (container, createApp, defineComponent, ref, CdxDialog, CdxButton, CdxSelect, CdxField, scriptName, buttonElement) {
    const InstallDialog = defineComponent({
      components: { CdxDialog, CdxButton, CdxSelect, CdxField },
      setup () {
        const dialogOpen = ref(true)
        const selectedSkin = ref('common')
        const isInstalling = ref(false)
                
        // Create skin options
        const skinOptions = SKINS.map(function (skin) {
          const label = skin === 'common' ? (typeof t === 'function' ? t('skin-common') : SM_t('skin-common')) : skin
          return { label, value: skin }
        })
                
        const handleInstall = function () {
          isInstalling.value = true
          buttonElement.text(SM_t('action-install-progress'))
          const p = createImport.ofLocal(scriptName, selectedSkin.value).install()
          if (p && typeof p.then === 'function') {
            const onFinally = function () {
              isInstalling.value = false 
            }
            p.then(function () {
              buttonElement.text(SM_t('action-uninstall'))
              dialogOpen.value = false
              try {
                safeUnmount(app, container[0]) 
              } catch (e) {}
              reloadAfterChange()
            }).catch(function (error) {
              smLog('Failed to install script:', error)
              showNotification('notification-install-error', 'error', scriptName)
              buttonElement.text(SM_t('action-install'))
            })
            if (typeof p.finally === 'function') {
              p.finally(onFinally) 
            } else {
              p.then(onFinally, onFinally) 
            }
          } else if (p && typeof p.done === 'function') {
            p.done(function () {
              buttonElement.text(SM_t('action-uninstall'))
              dialogOpen.value = false
              try {
                safeUnmount(app, container[0]) 
              } catch (e) {}
              reloadAfterChange()
            }).fail(function (error) {
              smLog('Failed to install script:', error)
              showNotification('notification-install-error', 'error', scriptName)
              buttonElement.text(SM_t('action-install'))
            }).always(function () {
              isInstalling.value = false 
            })
          } else {
            isInstalling.value = false
          }
        }
                
        const handleCancel = function () {
          dialogOpen.value = false
          try {
            safeUnmount(app, container[0]) 
          } catch (e) {}
          try {
            if (buttonElement && typeof buttonElement.resetBusy === 'function') buttonElement.resetBusy() 
          } catch (_) {}
        }
        const handleOpenUpdate = function (v) {
          smLog('install dialog update:open ->', v)
          dialogOpen.value = v
          if (v === false) {
            try {
              handleCancel() 
            } catch (e) {
              smLog('handleOpenUpdate cancel error', e) 
            } 
          }
        }
                
        return {
          dialogOpen,
          selectedSkin,
          isInstalling,
          skinOptions,
          handleInstall,
          handleCancel,
          handleOpenUpdate,
          SM_t: t,
          scriptName
        }
      },
      template: `
                <cdx-dialog
                    v-model:open="dialogOpen"
                    :title="SM_t('dialog-install-title').replace ? SM_t('dialog-install-title').replace('$1', scriptName) : ('Install ' + scriptName)"
                    :use-close-button="true"
                    :default-action="{ label: SM_t('action-cancel') }"
                    :primary-action="{ label: isInstalling ? SM_t('action-install-progress') : SM_t('action-install'), actionType: 'progressive', disabled: isInstalling }"
                    @default="handleCancel"
                    @close="handleCancel"
                    @update:open="handleOpenUpdate"
                    @primary="handleInstall"
                >
                    <p v-text="SM_t('security-warning').replace('$1', SM_t('security-warning-section').replace('$1', scriptName))"></p>
                    
                    <cdx-field>
                        <template #label><span v-text="SM_t('dialog-move-to-skin')"></span></template>
                        <cdx-select
                            v-model:selected="selectedSkin"
                            :menu-items="skinOptions"
                            :default-label="SM_t('dialog-move-select-target')"
                        />
                    </cdx-field>
                </cdx-dialog>
            `
    })
        
    try {
      app = createApp(InstallDialog)
      try {
        if (app && app.config && app.config.compilerOptions) {
          app.config.compilerOptions.delimiters = ['[%', '%]'] 
        } 
      } catch (_) {}
      app.component('CdxDialog', CdxDialog)
      app.component('CdxButton', CdxButton)
      app.component('CdxSelect', CdxSelect)
      app.component('CdxField', CdxField)
      app.mount(container)
      smLog('InstallDialog: mounted')
    } catch (error) {
      smLog('Error mounting install dialog:', error)
      container.remove()
    }
  }

  function showMoveDialog (anImport) {
    // Create container for move dialog
    const container = $( '<div>' ).attr( 'id', 'sm-move-dialog' )
        
    // Load Vue and Codex for move dialog
    loadVueCodex().then(function (libs) {
      smInfo('showMoveDialog: libs loaded')
      if (!libs.createApp || !libs.CdxDialog || !libs.CdxButton || !libs.CdxSelect || !libs.CdxField) {
        throw new Error('Codex/Vue components not available for move dialog')
      }
      createMoveDialog(container, libs.createApp, libs.defineComponent, libs.ref, libs.CdxDialog, libs.CdxButton, libs.CdxSelect, libs.CdxField, anImport)
    }).catch(function (error) {
      smError('Failed to load Vue/Codex for move dialog:', error)
      // Fallback to old prompt dialog
      let dest = null
      const PROMPT = SM_t('dialog-move-prompt') + ' ' + SKINS.join(', ')
      do {
        dest = (window.prompt(PROMPT) || '').toLowerCase()
      } while (dest && SKINS.indexOf(dest) < 0)
      if (!dest) return
            
      const key = 'move-' + anImport.getDescription()
      setLoading(key, true)
      const pPromptMove = toPromise(anImport.move(dest))
      pPromptMove.then(function () {
        // Reload data without closing dialog
        return refreshImportsView()
      }).catch(function (error) {
        smLog('Failed to move script:', error)
        showNotification('notification-move-error', 'error', anImport.getDescription())
      })
      if (pPromptMove && typeof pPromptMove.finally === 'function') {
        pPromptMove.finally(function () {
          setLoading(key, false) 
        }) 
      } else {
        setLoading(key, false) 
      }
    })
        
    // Add to body
    $('body').append(container)
  }

  function createMoveDialog (container, createApp, defineComponent, ref, CdxDialog, CdxButton, CdxSelect, CdxField, anImport) {
    let app
    const MoveDialog = defineComponent({
      components: { CdxDialog, CdxButton, CdxSelect, CdxField },
      setup () {
        const dialogOpen = ref(true)
        const selectedTarget = ref('common')
        const isMoving = ref(false)
                
        // Create target options (exclude current target)
        const targetOptions = SKINS.filter(function (skin) {
          return skin !== anImport.target
        }).map(function (skin) {
          return {
            label: skin === 'global' ? SM_t('skin-global') : skin,
            value: skin
          }
        })
                
        smLog('Move dialog - current target:', anImport.target)
        smLog('Move dialog - target options:', targetOptions)
                
        const handleMove = function () {
          if (isMoving.value) return
                    
          isMoving.value = true
                    
          smLog('Moving script:', anImport.getDescription())
          smLog('From target:', anImport.target)
          smLog('To target:', selectedTarget.value)
                    
          const pMoveDlg = toPromise(anImport.move(selectedTarget.value))
          pMoveDlg.then(function () {
            smLog('Move successful')
            return buildImportList().then(function () {
              if (importsRef) {
                importsRef.value = imports 
              } 
            })
          }).then(function () {
            dialogOpen.value = false
            try {
              safeUnmount(app, container[0]) 
            } catch (e) {}
          }).catch(function (error) {
            smError('Failed to move script:', error)
            showNotification('notification-move-error', 'error', anImport.getDescription())
          })
          if (pMoveDlg && typeof pMoveDlg.finally === 'function') {
            pMoveDlg.finally(function () {
              isMoving.value = false 
            }) 
          } else {
            isMoving.value = false 
          }
        }
                
        const handleClose = function () {
          dialogOpen.value = false
          try {
            safeUnmount(app, container[0]) 
          } catch (e) {}
        }
                
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
        }
      },
      template: `
                <CdxDialog
                    v-model:open="dialogOpen"
                    :title="SM_t('dialog-move-title').replace('$1', scriptName)"
                    :use-close-button="true"
                    @close="handleClose"
                >
                    <div class="sm-move-content">
                        <p><strong><span v-text="SM_t('dialog-move-current-location')"></span></strong> <span v-text="currentTarget === 'global' ? SM_t('skin-global') : currentTarget"></span></p>
                         
                         <CdxField>
                            <template #label><span v-text="SM_t('dialog-move-to-skin')"></span></template>
                            <CdxSelect
                                v-model:selected="selectedTarget"
                                :menu-items="targetOptions"
                                :disabled="isMoving"
                                :default-label="SM_t('dialog-move-select-target')"
                            />
                        </CdxField>
                        
                        <div class="sm-move-actions">
                            <CdxButton
                                @click="handleMove"
                                :disabled="isMoving"
                                action="progressive"
                            >
                                <span v-text="isMoving ? SM_t('dialog-move-progress') : SM_t('dialog-move-button')"></span>
                            </CdxButton>
                        </div>
                    </div>
                </CdxDialog>
            `
    })
        
    try {
      app = createApp(MoveDialog)
      try {
        if (app && app.config && app.config.compilerOptions) {
          app.config.compilerOptions.delimiters = ['[%', '%]'] 
        } 
      } catch (_) {}
      app.component('CdxDialog', CdxDialog)
      app.component('CdxButton', CdxButton)
      app.component('CdxSelect', CdxSelect)
      app.component('CdxField', CdxField)
      app.mount(container)
    } catch (error) {
      smLog('Error mounting move dialog:', error)
      container.remove()
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
  function getWikitext ( title ) {
    return getApiForTitle( title ).get({
      action: 'query',
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      rvlimit: 1,
      titles: title
    }).then( function ( resp ) {
      const text = extractWikitextFromResponse(resp)
      return text == null ? '' : text
    } )
  }

  function escapeForRegex ( s ) {
    return s.replace( /[-/\\^$*+?.()|[\]{}]/g, '\\$&' )
  }

  /**
    * Escape a string for use in a JavaScript string literal.
    * This function is adapted from
    * https://github.com/joliss/js-string-escape/blob/6887a69003555edf5c6caaa75f2592228558c595/index.js
    * (released under the MIT licence).
    */
  function escapeForJsString ( s ) {
    return s.replace( /["'\\\n\r\u2028\u2029]/g, function ( character ) {
      // Escape all characters not included in SingleStringCharacters and
      // DoubleStringCharacters on
      // http://www.ecma-international.org/ecma-262/5.1/#sec-7.8.4
      switch ( character ) {
      case '"':
      case '\'':
      case '\\':
        return '\\' + character
        // Four possible LineTerminator characters need to be escaped:
      case '\n':
        return '\\n'
      case '\r':
        return '\\r'
      case '\u2028':
        return '\\u2028'
      case '\u2029':
        return '\\u2029'
      }
    } )
  }

  /**
    * Escape a string for use in an inline JavaScript comment (comments that
    * start with two slashes "//").
    * This function is adapted from
    * https://github.com/joliss/js-string-escape/blob/6887a69003555edf5c6caaa75f2592228558c595/index.js
    * (released under the MIT licence).
    */
  function escapeForJsComment ( s ) {
    return s.replace( /[\n\r\u2028\u2029]/g, function ( character ) {
      switch ( character ) {
      // Escape possible LineTerminator characters
      case '\n':
        return '\\n'
      case '\r':
        return '\\r'
      case '\u2028':
        return '\\u2028'
      case '\u2029':
        return '\\u2029'
      }
    } )
  }

  /**
    * Unescape a JavaScript string literal.
    *
    * This is the inverse of escapeForJsString.
    */
  function unescapeForJsString ( s ) {
    return s.replace( /\\"|\\'|\\\\|\\n|\\r|\\u2028|\\u2029/g, function ( substring ) {
      switch ( substring ) {
      case '\\"':
        return '"'
      case '\\\'':
        return '\''
      case '\\\\':
        return '\\'
      case '\\r':
        return '\r'
      case '\\n':
        return '\n'
      case '\\u2028':
        return '\u2028'
      case '\\u2029':
        return '\u2029'
      }
    } )
  }

  function getFullTarget ( target ) {
    // CSS installs are still supported via page value ending with .css.
    if ( target === 'global' ) {
      return 'User:' + mw.config.get( 'wgUserName' ) + '/global.js'
    }
    return USER_NAMESPACE_NAME + ':' + mw.config.get( 'wgUserName' ) + '/' + 
                target + '.js'
  }

  /**
     * Select API instance by target skin (global uses ForeignApi)
     * @param {string} target
     * @returns {any} mw.Api or mw.ForeignApi
     */
  function getApiForTarget ( target ) {
    return target === 'global' ? metaApi : api
  }

  /**
     * Select API instance by title (global.js uses ForeignApi)
     * @param {string} title
     * @returns {any} mw.Api or mw.ForeignApi
     */
  function getApiForTitle ( title ) {
    return title.indexOf( '/global.js' ) !== -1 ? metaApi : api
  }

  function getSummaryForTarget ( target, summaryKey, description ) {
    try {
      const server = (mw && mw.config && mw.config.get ? (mw.config.get('wgServerName') || '') : '')
      const englishOnlyHost = /(^|\.)mediawiki\.org$/i.test(server) || /(^|\.)wikidata\.org$/i.test(server)
      if (target === 'global' || englishOnlyHost) {
        return (STRINGS_EN[summaryKey] || summaryKey).replace( '$1', description ) + (SUMMARY_TAG ? ' ' + SUMMARY_TAG : '')
      }
      if (STRINGS_SITE && Object.prototype.hasOwnProperty.call(STRINGS_SITE, summaryKey)) {
        return STRINGS_SITE[summaryKey].replace( '$1', description ) + (SUMMARY_TAG ? ' ' + SUMMARY_TAG : '')
      }
      if (STRINGS && Object.prototype.hasOwnProperty.call(STRINGS, summaryKey)) {
        return STRINGS[summaryKey].replace( '$1', description ) + (SUMMARY_TAG ? ' ' + SUMMARY_TAG : '')
      }
      return (STRINGS_EN[summaryKey] || summaryKey).replace( '$1', description ) + (SUMMARY_TAG ? ' ' + SUMMARY_TAG : '')
    } catch (_) {
      return (STRINGS_EN[summaryKey] || summaryKey).replace( '$1', description )
    }
  }

  // From https://stackoverflow.com/a/10192255
  function uniques ( array ) {
    return array.filter( function ( el, index, arr ) {
      return index === arr.indexOf( el )
    })
  }


  // Initialize default target: prefer new var, fallback to legacy, default to "common"
  if (!window.SM_DEFAULT_SKIN || typeof window.SM_DEFAULT_SKIN !== 'string') {
    if (typeof window.scriptInstallerInstallTarget === 'string' && window.scriptInstallerInstallTarget) {
      window.SM_DEFAULT_SKIN = window.scriptInstallerInstallTarget
    } else {
      window.SM_DEFAULT_SKIN = 'common' // by default, install things to the user's common.js
    }
  }
  // Keep legacy alias in sync
  try {
    window.scriptInstallerInstallTarget = window.SM_DEFAULT_SKIN 
  } catch (_) {}
  // Sync module variable with global alias
  try {
    SM_DEFAULT_SKIN = window.SM_DEFAULT_SKIN || 'common' 
  } catch (_) {}

  // SUMMARY_TAG: internal constant
  // SUMMARY_TAG already initialized above

  const isJsRelatedPage = (function () {
    try {
      const pn = mw.config.get( 'wgPageName' ) || ''
      const cm = mw.config.get( 'wgPageContentModel' ) || ''
      return /\.js$/i.test(pn) || /\.css$/i.test(pn) || /javascript|css|sanitized-css/i.test(cm)
    } catch (_) {
      return true 
    }
  })()

  // Load languageFallbacks.json from GitLab via CORS proxy
  let languageFallbacks = {}
  fetch('https://gitlab-content.toolforge.org/iniquity/script-manager/-/raw/main/data/languageFallbacks.json?mime=application/json')
    .then(resp => resp.json())
    .then(fallbacks => {
      languageFallbacks = fallbacks 
    })
    .catch(() => {
      languageFallbacks = {} 
    })

  function getLanguageChain (lang) {
    const chain = [lang]
    let current = lang
    const visited = new Set([lang])
    while (languageFallbacks[current]) {
      for (const fallback of languageFallbacks[current]) {
        if (!visited.has(fallback)) {
          chain.push(fallback)
          visited.add(fallback)
          current = fallback
          break
        }
      }
      if (chain[chain.length - 1] === current) break
    }
    if (!chain.includes('en')) chain.push('en')
    return chain
  }

  // i18n helpers
  function t (key) {
    try {
      if (STRINGS && Object.prototype.hasOwnProperty.call(STRINGS, key)) return STRINGS[key]
      if (STRINGS_EN && Object.prototype.hasOwnProperty.call(STRINGS_EN, key)) {
        smWarn('Missing i18n key in current language:', key); return STRINGS_EN[key] 
      }
      smWarn('Missing i18n key in all languages:', key); return key
    } catch (e) {
      return key 
    }
  }
  // Local alias for templates via app.config.globalProperties.SM_t
  const SM_t = t

  function loadI18nWithFallback (lang, callback) {
    const chain = getLanguageChain(lang)
    let idx = 0
    let loadedCount = 0
      
    function tryNext () {
      if (idx >= chain.length) {
        smLog('No localization found for any fallback language')
        return
      }
      const tryLang = chain[idx++]
      const url = `https://gitlab-content.toolforge.org/iniquity/script-manager/-/raw/main/i18n/${tryLang}.json?mime=application/json`
      fetch(url)
        .then(resp => resp.ok ? resp.json() : Promise.reject('HTTP ' + resp.status))
        .then(i18n => {
          if (tryLang === 'en') {
            STRINGS_EN = i18n
            // Only set STRINGS to English if no other language was loaded
            if (loadedCount === 0) {
              STRINGS = i18n
            }
          } else {
            STRINGS = i18n
          }
          loadedCount++
          if (loadedCount >= 2 || (loadedCount === 1 && !chain.includes('en')) || (loadedCount === 1 && tryLang === 'en')) {
            if (callback) callback()
          }
        })
        .catch(err => {
          smLog('Failed to load i18n for', tryLang, ':', err)
          tryNext()
        })
    }
      
    // Load both current language and English
    tryNext()
    if (lang !== 'en') {
      idx = chain.indexOf('en')
      if (idx === -1) idx = chain.length
      tryNext()
    }
    // Additionally load site content language for summaries if different
    try {
      const siteLang = (mw && mw.config && mw.config.get ? (mw.config.get('wgContentLanguage') || 'en') : 'en')
      if (siteLang && siteLang !== 'en' && siteLang !== lang) {
        const siteUrl = 'https://gitlab-content.toolforge.org/iniquity/script-manager/-/raw/main/i18n/' + encodeURIComponent(siteLang) + '.json?mime=application/json'
        fetch(siteUrl).then(function (r) {
          if (!r.ok) throw new Error('HTTP '+r.status); return r.json() 
        }).then(function (json) {
          STRINGS_SITE = json || {} 
        }).catch(function () {})
      }
    } catch (_) {}
  }

  // Prewarm Codex bundles early to speed up first open of the modal (optional)
  try { 
    let SHOULD_PREWARM = !!window.SM_PREWARM_CODEX
    // Heuristic: prewarm if page likely relevant (user JS page, has scriptInstallerLink, or is user namespace)
    try {
      const ns = mw.config && mw.config.get ? mw.config.get('wgNamespaceNumber') : null
      if (!SHOULD_PREWARM && (document.getElementsByClassName('scriptInstallerLink').length > 0 || ns === 2)) SHOULD_PREWARM = true
    } catch (_) {}
    if (SHOULD_PREWARM && mw && mw.loader && typeof mw.loader.load === 'function') { 
      mw.loader.load(['vue', '@wikimedia/codex']) 
      smLog('prewarm: requested vue+codex')
    } 
  } catch (e) {}

  // Using:
  // I18N readiness signaling for lazy openers
  let SM_I18N_DONE = false
  const __SM_i18nCbs = []
  function SM_waitI18n (cb) {
    try {
      if (SM_I18N_DONE) {
        cb() 
      } else {
        __SM_i18nCbs.push(cb) 
      } 
    } catch (_) {} 
  }

  // API readiness (mw.Api and mw.ForeignApi initialized)
  let SM_API_READY = false
  const __SM_apiCbs = []
  function SM_waitApiReady (cb) {
    try {
      if (SM_API_READY) {
        cb() 
      } else {
        __SM_apiCbs.push(cb) 
      } 
    } catch (_) {} 
  }

  // Fine-grained readiness flags
  let SM_IMPORTS_READY = false
  const __SM_importCbs = []
  function SM_waitImportsReady (cb) {
    try {
      if (SM_IMPORTS_READY) {
        cb() 
      } else {
        __SM_importCbs.push(cb) 
      } 
    } catch (_) {} 
  }

  let SM_GADGETS_READY = false
  let SM_GADGETS_LOADING = false
  // Ensure Gadgets tab label is available before first render
  let SM_GADGETS_LABEL_READY = false
  const __SM_gadgetsLabelCbs = []
  function SM_waitGadgetsLabelReady (cb) {
    try {
      if (SM_GADGETS_LABEL_READY) {
        cb() 
      } else {
        __SM_gadgetsLabelCbs.push(cb) 
      } 
    } catch (_) {} 
  }

  const userLang = mw.config.get('wgUserLanguage') || 'en'

  // Helper: start gadgets metadata and section labels loading once
  function SM_startGadgetsAndLabels () {
    if (!SM_GADGETS_READY && !SM_GADGETS_LOADING) {
      SM_GADGETS_LOADING = true
      loadGadgets().then(function () {
        return loadSectionLabels() 
      })
        .then(function (sectionLabels) {
          applyGadgetLabels(sectionLabels, gadgetsLabelVar); SM_GADGETS_READY = true 
        })
        .catch(function () {
          SM_GADGETS_READY = true 
        })
        .finally ? null : (function () {
          try {
            if (scriptInstallerVueComponent && typeof scriptInstallerVueComponent.$forceUpdate==='function') scriptInstallerVueComponent.$forceUpdate() 
          } catch (_) {} 
        })()
      if (!_pLoadUserGadgetSettings) {
        loadUserGadgetSettings() 
      }
    }
  }
  loadI18nWithFallback(userLang, function () {
    SM_I18N_DONE = true; try {
      (__SM_i18nCbs||[]).splice(0).forEach(function (cb) {
        try {
          cb() 
        } catch (_) {} 
      }) 
    } catch (_) {}
    $.when(
      $.ready,
      mw.loader.using(['mediawiki.api', 'mediawiki.ForeignApi', 'mediawiki.util'])
    ).then(function () {
      api = new mw.Api()
      metaApi = new mw.ForeignApi( 'https://meta.wikimedia.org/w/api.php' )
      try {
        SM_API_READY = true; (__SM_apiCbs||[]).splice(0).forEach(function (cb) {
          try {
            cb() 
          } catch (_) {} 
        }) 
      } catch (_) {}
        
      // Load imports only for default target first to open UI faster
      const initialTarget = SM_DEFAULT_SKIN
      buildImportList([initialTarget]).then(function () {
        try {
          SM_IMPORTS_READY = true; (__SM_importCbs||[]).splice(0).forEach(function (cb) {
            try {
              cb() 
            } catch (_) {} 
          }) 
        } catch (_) {}
      })

      // Start background gadgets/labels/user settings as soon as API ready
      SM_waitApiReady(function () {
        SM_startGadgetsAndLabels() 
      })

      // Prefetch only the gadgets tab label early, so tab title is localized before mount
      SM_waitApiReady(function () {
        try {
          if (!SM_GADGETS_LABEL_READY) {
            loadGadgetsLabel().then(function (label) {
              try {
                gadgetsLabelVar = label || gadgetsLabelVar 
              } catch (_) {}
              SM_GADGETS_LABEL_READY = true
              try {
                (__SM_gadgetsLabelCbs||[]).splice(0).forEach(function (cb) {
                  try {
                    cb() 
                  } catch (_) {} 
                }) 
              } catch (_) {}
            }).catch(function () {
              SM_GADGETS_LABEL_READY = true
              try {
                (__SM_gadgetsLabelCbs||[]).splice(0).forEach(function (cb) {
                  try {
                    cb() 
                  } catch (_) {} 
                }) 
              } catch (_) {}
            })
          }
        } catch (_) {}
      })
    }).then(function () {
      attachInstallLinks()
      // Open only after i18n, gadgets label, and imports are ready to avoid label flicker
      SM_waitI18n(function () {
        SM_waitGadgetsLabelReady(function () {
          if (isJsRelatedPage) {
            SM_waitImportsReady(function () {
              showUi() 
            })
          }
        })
      })
      // No auto-open via cookie
    })
  })
  // Public opener (non-global): listen to hook/event and open
  try {
    function SM_openScriptManager () {
      const doOpen = function () {
        try {
          const exists = !!document.getElementById('sm-panel')
          if (!exists) {
            // Wait for i18n and gadgets label to avoid flicker when opening from sidebar on non-script pages
            SM_waitI18n(function () {
              SM_waitGadgetsLabelReady(function () {
                $('#mw-content-text').before( makePanel() )
                // Kick off background loads after panel mounts (ensure API ready first)
                try {
                // Load remaining imports in background
                  SM_waitApiReady(function () {
                    ensureAllImports() 
                  })
                  // Start gadgets & labels & user settings
                  SM_waitApiReady(function () {
                    SM_startGadgetsAndLabels() 
                  })
                } catch (_) {}
              }) 
            })
          } else {
            $('#sm-panel').remove()
          }
        } catch (e) {
          smLog('SM_openScriptManager error', e) 
        }
      }
      // Open after i18n gate
      try {
        doOpen() 
      } catch (_) { /* no-op */ }
    }
    try {
      if (mw && mw.hook) mw.hook('scriptManager.open').add(function () {
        SM_openScriptManager() 
      }) 
    } catch (_) {}
    try {
      document.addEventListener('sm:open', function () {
        try {
          SM_openScriptManager() 
        } catch (_) {} 
      }) 
    } catch (_) {}
  } catch (e) {}
} )()
