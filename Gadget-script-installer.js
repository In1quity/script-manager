/**
 * script-installer loader
 */

if( mw.config.get( "wgNamespaceNumber" ) > 0 ) {
    var jsPage = mw.config.get( "wgPageName" ).slice( -3 ) === ".js" ||
        mw.config.get( "wgPageContentModel" ) === "javascript";
    if( jsPage || document.getElementsByClassName( "scriptInstallerLink" ).length ||
            document.querySelector( "table.infobox-user-script" ) ) {
        window.ADVERT = "([[ru:User:Iniquity/scriptInstaller.js|Script Manager]])";
        mw.loader.load('https://ru.wikipedia.org/w/index.php?title=Участник:Iniquity/Gadget-script-installer-core.js&action=raw&ctype=text/javascript&action=raw&ctype=text/javascript');
        mw.loader.load('https://ru.wikipedia.org/w/index.php?title=Участник:Iniquity/Gadget-script-installer-core.css&action=raw&ctype=text/css&action=raw&ctype=text/css', 'text/css');
    }
}
