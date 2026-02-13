export function safeUnmount(app, root) {
	try {
		if (app && typeof app.unmount === 'function') {
			app.unmount();
		}
	} catch {
		// Ignore unmount race conditions.
	}
	try {
		if (root?.parentNode) {
			root.parentNode.removeChild(root);
		}
	} catch {
		// Ignore already removed roots.
	}
}
