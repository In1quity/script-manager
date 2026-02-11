export function toPromise(maybeThenable) {
	if (maybeThenable && typeof maybeThenable.then === 'function') {
		return maybeThenable;
	}
	return Promise.resolve(maybeThenable);
}
