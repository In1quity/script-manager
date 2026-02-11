import { startCoreRuntime } from './coreRuntime.js';

export async function startLegacyCore(context) {
	return startCoreRuntime(context);
}
