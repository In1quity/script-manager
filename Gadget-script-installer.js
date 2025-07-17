/**
 * script-installer loader
 */

if( mw.config.get( "wgNamespaceNumber" ) > 0 ) {
    var jsPage = mw.config.get( "wgPageName" ).slice( -3 ) === ".js" ||
        mw.config.get( "wgPageContentModel" ) === "javascript";
    if( jsPage || document.getElementsByClassName( "scriptInstallerLink" ).length ||
            document.querySelector( "table.infobox-user-script" ) ) {
        window.ADVERT = "([[User:Enterprisey/script-installer|script-installer]])";
        window.SCRIPT_INSTALLER_STRINGS_URL = 'i18n/Gadget-script-installer-core.ru.json';
        mw.loader.load('https://en.wikipedia.org/w/index.php?title=MediaWiki:Gadget-script-installer-core.js&action=raw&ctype=text/javascript');
        mw.loader.load('https://en.wikipedia.org/w/index.php?title=MediaWiki:Gadget-script-installer-core.css&action=raw&ctype=text/css', 'text/css');
    }
}
