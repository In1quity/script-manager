import { APP_NAMESPACE } from '@constants/runtime';
import { createLogger } from '@utils/logger';

export function createRuntimeContext(options = {}) {
	const runtime = {
		window: typeof window !== 'undefined' ? window : null,
		document: typeof document !== 'undefined' ? document : null,
		mw: typeof mw !== 'undefined' ? mw : null,
		$: typeof jQuery !== 'undefined' ? jQuery : typeof $ !== 'undefined' ? $ : null
	};

	const logger = options.logger || createLogger(APP_NAMESPACE);
	const context = {
		namespace: APP_NAMESPACE,
		logger,
		runtime,
		version: typeof SM_VERSION !== 'undefined' ? SM_VERSION : 'dev',
		ImportClass: options.ImportClass || null,
		state: {
			initializedAt: Date.now()
		},
		getServerName() {
			try {
				return this.runtime.mw?.config?.get('wgServerName') || '';
			} catch {
				return '';
			}
		}
	};

	return context;
}
