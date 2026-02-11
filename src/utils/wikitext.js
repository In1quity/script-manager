export async function getWikitext(api, title) {
	const response = await api.get({
		action: 'query',
		prop: 'revisions',
		titles: title,
		rvprop: [ 'content' ],
		rvslots: 'main',
		formatversion: 2
	});

	return extractWikitextFromResponse(response);
}

export function extractWikitextFromResponse(response) {
	const page = response?.query?.pages?.[0];
	return page?.revisions?.[0]?.slots?.main?.content || '';
}
