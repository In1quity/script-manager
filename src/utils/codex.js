let libsPromise = null;

function mapCodexModules() {
	const codex = mw.loader.require('@wikimedia/codex');
	return {
		createApp: mw.loader.require('vue').createApp,
		defineComponent: mw.loader.require('vue').defineComponent,
		ref: mw.loader.require('vue').ref,
		computed: mw.loader.require('vue').computed,
		watch: mw.loader.require('vue').watch,
		CdxDialog: codex.CdxDialog,
		CdxButton: codex.CdxButton,
		CdxTextInput: codex.CdxTextInput,
		CdxSelect: codex.CdxSelect,
		CdxField: codex.CdxField,
		CdxTabs: codex.CdxTabs,
		CdxTab: codex.CdxTab,
		CdxToggleButton: codex.CdxToggleButton
	};
}

export function loadVueCodex() {
	if (!libsPromise) {
		libsPromise = mw.loader.using([ 'vue', '@wikimedia/codex' ]).then(mapCodexModules);
	}

	return libsPromise;
}
