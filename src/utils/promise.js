export function toPromise(maybeThenable) {
	try {
		if (!maybeThenable) {
			return Promise.resolve();
		}

		if (typeof maybeThenable.then === 'function') {
			return maybeThenable;
		}

		if (typeof maybeThenable.done === 'function') {
			return new Promise((resolve, reject) => {
				try {
					maybeThenable.done(resolve).fail(reject);
				} catch (error) {
					reject(error);
				}
			});
		}
	} catch {
		return Promise.resolve();
	}

	return Promise.resolve();
}
