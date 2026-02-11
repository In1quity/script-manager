export function isInstallableLink(node) {
	const className = node?.className || '';
	return typeof className === 'string' && className.includes('scriptInstallerLink');
}

export function collectInstallableLinks(root = document) {
	return Array.from(root.querySelectorAll('.scriptInstallerLink'));
}
