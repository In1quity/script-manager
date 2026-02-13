export async function fetchWithTimeout(resource, options = {}, timeoutMs = 10_000) {
	const { signal, ...restOptions } = options || {};
	const controller = new AbortController();
	const timeoutId = setTimeout(() => {
		controller.abort(new Error(`Fetch timeout after ${timeoutMs}ms`));
	}, timeoutMs);

	let abortHandler = null;
	if (signal) {
		if (signal.aborted) {
			controller.abort(signal.reason);
		} else {
			abortHandler = () => controller.abort(signal.reason);
			signal.addEventListener('abort', abortHandler, { once: true });
		}
	}

	try {
		return await fetch(resource, {
			...restOptions,
			signal: controller.signal
		});
	} finally {
		clearTimeout(timeoutId);
		if (signal && abortHandler) {
			signal.removeEventListener('abort', abortHandler);
		}
	}
}
