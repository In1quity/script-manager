let api = null;
let metaApi = null;

export function initApis() {
	if (!api) {
		api = new mw.Api();
	}

	if (!metaApi) {
		metaApi = new mw.ForeignApi('https://meta.wikimedia.org/w/api.php');
	}

	return { api, metaApi };
}

export function getApi() {
	return api;
}

export function getMetaApi() {
	return metaApi;
}

export function getApiForTarget(target) {
	if (target === 'global') {
		return getMetaApi();
	}

	return getApi();
}
