import { DEFAULT_SKIN, SKINS } from '@constants/skins';
import { filterScriptsByText } from '@components/ScriptList';

export function createScriptManagerPanelState() {
	return {
		dialogOpen: false,
		filterText: '',
		selectedSkin: DEFAULT_SKIN,
		availableSkins: SKINS.slice()
	};
}

export function getFilteredScripts(state, importsByTarget) {
	const target = state?.selectedSkin || DEFAULT_SKIN;
	const scripts = importsByTarget?.[target] || [];
	return filterScriptsByText(scripts, state?.filterText || '');
}
