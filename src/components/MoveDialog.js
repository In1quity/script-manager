export function buildMoveDialogState(scriptName, fromTarget = 'common', toTarget = 'global') {
	return {
		scriptName,
		fromTarget,
		toTarget,
		open: false
	};
}
