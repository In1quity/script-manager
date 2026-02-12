import { APP_NAMESPACE, DEFAULT_LOG_LEVEL, LOGGER_PREFIX, LOG_LEVELS } from '@constants/runtime';

function getGlobal() {
	try {
		if (typeof globalThis !== 'undefined') {
			return globalThis;
		}
		if (typeof window !== 'undefined') {
			return window;
		}
		return {};
	} catch {
		return {};
	}
}

function resolveLevelName() {
	try {
		const g = getGlobal();
		const raw =
			g.SM_LOG_LEVEL ||
			(g.scriptInstallerDebug ? 'debug' : DEFAULT_LOG_LEVEL);
		return String(raw || DEFAULT_LOG_LEVEL).toLowerCase();
	} catch {
		return DEFAULT_LOG_LEVEL;
	}
}

function resolveLevelValue() {
	const levelName = resolveLevelName();
	return Object.prototype.hasOwnProperty.call(LOG_LEVELS, levelName)
		? LOG_LEVELS[levelName]
		: LOG_LEVELS.info;
}

function write(method, minLevel, namespace, argsLike) {
	if (resolveLevelValue() < minLevel) {
		return;
	}

	try {
		const args = Array.prototype.slice.call(argsLike);
		const scope = namespace ? `${APP_NAMESPACE}:${namespace}` : APP_NAMESPACE;
		// Use console.log for debug so messages are visible when "Verbose" is off in devtools
		const out = method === console.debug ? console.log : method;
		out.apply(console, [ LOGGER_PREFIX, `[${scope}]`, ...args ]);
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
