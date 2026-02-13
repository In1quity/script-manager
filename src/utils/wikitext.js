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
	const fromFormatVersion2 = response?.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content;
	if (typeof fromFormatVersion2 === 'string') {
		return fromFormatVersion2;
	}

	const pagesObject = response?.query?.pages;
	if (!pagesObject || typeof pagesObject !== 'object') {
		return '';
	}
	const firstPage = Object.values(pagesObject)[0];
	return firstPage?.revisions?.[0]?.slots?.main?.['*'] || '';
}
