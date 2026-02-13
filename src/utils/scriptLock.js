const scriptLocks = new Map();

function normalizeLockKey(scriptName) {
	return String(scriptName || '').trim().toLowerCase();
}

export function runWithScriptLock(scriptName, task) {
	const key = normalizeLockKey(scriptName);
	const action = typeof task === 'function' ? task : () => Promise.resolve();
	const previous = scriptLocks.get(key) || Promise.resolve();
	const current = previous
		.catch(() => {
			// Keep queue alive after a rejected operation.
		})
		.then(() => action());

	scriptLocks.set(key, current);

	return current.finally(() => {
		if (scriptLocks.get(key) === current) {
			scriptLocks.delete(key);
		}
	});
}
