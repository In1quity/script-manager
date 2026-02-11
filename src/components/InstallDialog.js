export function buildInstallDialogState(scriptName, defaultTarget = 'common') {
	return {
		scriptName,
		target: defaultTarget,
		open: false
	};
}
