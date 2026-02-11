import { SM_NOTIFICATION_CLEANUP_DELAY, SM_NOTIFICATION_DISPLAY_TIME } from '@constants/config';
import { t } from '@services/i18n';
import { createLogger } from '@utils/logger';

const logger = createLogger('notification');

export function getMessageStack() {
	let stack = document.getElementById('sm-message-stack');
	if (!stack) {
		stack = document.createElement('div');
		stack.id = 'sm-message-stack';
		stack.className = 'sm-message-stack';
		try {
			stack.setAttribute('aria-live', 'polite');
			stack.setAttribute('aria-atomic', 'true');
		} catch {
			// Ignore unsupported aria attributes.
		}
		document.body.appendChild(stack);
	}
	return stack;
}

function toStatus(type) {
	if (type === 'success') {
		return 'success';
	}
	if (type === 'warning') {
		return 'warning';
	}
	if (type === 'error') {
		return 'error';
	}
	return 'notice';
}

function localizeMessage(messageKeyOrText, param) {
	if (typeof messageKeyOrText !== 'string') {
		return messageKeyOrText;
	}
	const translated = t(messageKeyOrText, messageKeyOrText);
	if (param === undefined || typeof translated !== 'string') {
		return translated;
	}
	return translated.replace('$1', param);
}

function fallbackNotify(message, type = 'notice', options = {}) {
	try {
		mw.notify(message, {
			autoHide: true,
			autoHideSeconds: 'long',
			tag: 'script-manager',
			type,
			...options
		});
		return;
	} catch (error) {
		logger.warn('mw.notify fallback failed', error);
	}

	window.setTimeout(() => {
		try {
			window.alert(String(message || 'Script Manager'));
		} catch {
			/* no-op */
		}
	}, Math.min(SM_NOTIFICATION_DISPLAY_TIME, 200));
}

export function showNotification(messageKeyOrText, type = 'notice', param) {
	const message = localizeMessage(messageKeyOrText, param);
	const status = toStatus(type);

	void mw.loader
		.using([ 'vue', '@wikimedia/codex' ])
		.then(() => {
			const vue = mw.loader.require('vue');
			const codex = mw.loader.require('@wikimedia/codex');
			const createApp = vue?.createApp || vue?.createMwApp;
			const CdxMessage = codex?.CdxMessage || codex?.components?.CdxMessage;

			if (!createApp || !CdxMessage) {
				throw new Error('Codex CdxMessage unavailable');
			}

			const stack = getMessageStack();
			const host = document.createElement('div');
			host.className = 'sm-message-host';
			try {
				if (status === 'error' || status === 'warning') {
					host.setAttribute('role', 'alert');
					host.setAttribute('aria-live', 'assertive');
				} else {
					host.setAttribute('role', 'status');
					host.setAttribute('aria-live', 'polite');
				}
			} catch {
				// Ignore unsupported aria attributes.
			}
			stack.appendChild(host);

			const app = createApp({
				data() {
					return {
						type: status,
						message,
						show: true
					};
				},
				template:
					'<transition name="sm-fade"><CdxMessage v-if="show" :type="type" :fade-in="true" :allow-user-dismiss="true" :auto-dismiss="true" :display-time="' +
					SM_NOTIFICATION_DISPLAY_TIME +
					'"><div v-html="message"></div></CdxMessage></transition>'
			});

			app.component('CdxMessage', CdxMessage);
			app.mount(host);

			setTimeout(() => {
				try {
					app.unmount();
					if (host.parentNode) {
						host.parentNode.removeChild(host);
					}
				} catch {
					// Ignore unmount race conditions.
				}
			}, SM_NOTIFICATION_CLEANUP_DELAY);
		})
		.catch((error) => {
			logger.warn('Codex notification fallback to mw.notify', error);
			fallbackNotify(String(message || ''), status);
		});
}
