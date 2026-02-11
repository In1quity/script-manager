import { APP_NAMESPACE, DEFAULT_LOG_LEVEL, LOGGER_PREFIX, LOG_LEVELS } from '@constants/runtime';

function resolveLevelName() {
	try {
		const raw = window.SM_LOG_LEVEL || (window.scriptInstallerDebug ? 'debug' : DEFAULT_LOG_LEVEL);
		return String(raw || DEFAULT_LOG_LEVEL).toLowerCase();
	} catch {
		return DEFAULT_LOG_LEVEL;
	}
}

function resolveLevelValue() {
	const levelName = resolveLevelName();
	return Object.prototype.hasOwnProperty.call(LOG_LEVELS, levelName) ? LOG_LEVELS[levelName] : LOG_LEVELS.info;
}

function write(method, minLevel, namespace, argsLike) {
	if (resolveLevelValue() < minLevel) {
		return;
	}

	try {
		const args = Array.prototype.slice.call(argsLike);
		const scope = namespace ? `${APP_NAMESPACE}:${namespace}` : APP_NAMESPACE;
		method.apply(console, [ LOGGER_PREFIX, `[${scope}]`, ...args ]);
	} catch {
		// Keep logger resilient in wiki runtimes with patched consoles.
	}
}

export function createLogger(namespace = '') {
	return {
		debug() {
			write(console.debug, LOG_LEVELS.debug, namespace, arguments);
		},
		info() {
			write(console.info, LOG_LEVELS.info, namespace, arguments);
		},
		warn() {
			write(console.warn, LOG_LEVELS.warn, namespace, arguments);
		},
		error() {
			write(console.error, LOG_LEVELS.error, namespace, arguments);
		},
		child(nextNamespace) {
			const merged = [ namespace, nextNamespace ].filter(Boolean).join('.');
			return createLogger(merged);
		}
	};
}
