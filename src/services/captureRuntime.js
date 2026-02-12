const CAPTURE_JS_URL =
	'//www.mediawiki.org/w/index.php?title=User:Iniquity/scriptManager-capture.js&action=raw&ctype=text/javascript';

let capturePromise = null;

function markCaptureActive() {
	try {
		window.__SM_CAPTURE_ACTIVE = true;
	} catch {
		// Ignore readonly runtime globals.
	}
}

function isCaptureReady() {
	try {
		return window.__SM_CAPTURE_READY === true;
	} catch {
		return false;
	}
}

export function ensureCaptureRuntimeLoaded() {
	markCaptureActive();
	if (isCaptureReady()) {
		return Promise.resolve();
	}
	if (capturePromise) {
		return capturePromise;
	}

	capturePromise = new Promise((resolve, reject) => {
		try {
			if (mw?.loader && typeof mw.loader.getScript === 'function') {
				mw.loader.getScript(CAPTURE_JS_URL).then(resolve, reject);
				return;
			}
		} catch {
			// Continue with plain script fallback.
		}

		try {
			const script = document.createElement('script');
			script.src = CAPTURE_JS_URL;
			script.async = true;
			script.onload = resolve;
			script.onerror = (error) => reject(error || new Error('Failed to load capture runtime'));
			document.head.appendChild(script);
		} catch (error) {
			reject(error);
		}
	}).finally(() => {
		capturePromise = null;
	});

	return capturePromise;
}
