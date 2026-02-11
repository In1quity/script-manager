export const APP_NAMESPACE = 'script-manager';
export const LOGGER_PREFIX = '[SM]';
export const BRIDGE_GLOBAL_KEY = '__SM_RUNTIME_BRIDGE__';
export const CORE_RUNTIME_GLOBAL_KEY = '__SM_RUNTIME_BRIDGE__';

export const DEFAULT_LOG_LEVEL = 'info';
export const LOG_LEVELS = {
	silent: 0,
	error: 1,
	warn: 2,
	info: 3,
	debug: 4
};

export const MEDIAWIKI_CORE_MODULES = [
	'mediawiki.util',
	'mediawiki.api',
	'mediawiki.ForeignApi'
];
