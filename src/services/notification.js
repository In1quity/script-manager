import { SM_NOTIFICATION_DISPLAY_TIME } from '@constants/config';

export function showNotification(message, options = {}) {
	try {
		mw.notify(message, {
			autoHide: true,
			autoHideSeconds: 'long',
			tag: 'script-manager',
			...options
		});
		return;
	} catch {
		// Fall back to plain alert only if mw.notify is unavailable.
	}

	window.setTimeout(() => {
		try {
			window.alert(String(message || 'Script Manager'));
		} catch {
			/* no-op */
		}
	}, Math.min(SM_NOTIFICATION_DISPLAY_TIME, 200));
}
