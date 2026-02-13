import { t } from '@services/i18n';

export function getSkinTooltip(skin) {
	if (skin !== 'common' && skin !== 'global') {
		return '';
	}
	const hintKey = `skin-${skin}-tooltip`;
	const hint = t(hintKey, '');
	if (typeof hint !== 'string') {
		return '';
	}
	const normalizedHint = hint.trim();
	if (!normalizedHint || normalizedHint === hintKey) {
		return '';
	}
	return normalizedHint;
}

export function getSkinLabel(skin, includeTooltip = false) {
	if (skin !== 'common' && skin !== 'global') {
		return skin;
	}

	const labelKey = `skin-${skin}`;
	const label = t(labelKey, skin);
	if (!includeTooltip) {
		return label;
	}

	const tooltip = getSkinTooltip(skin);
	if (!tooltip || tooltip === label) {
		return label;
	}

	return `${label} ${tooltip}`.trim();
}
