export async function getWikitext(api, title) {
	const response = await api.get({
		action: 'query',
		prop: 'revisions',
		titles: title,
		rvprop: [ 'content', 'ids', 'timestamp' ],
		rvslots: 'main',
		curtimestamp: 1,
		formatversion: 2
	});

	return extractWikitextFromResponse(response);
}

export async function getWikitextWithMeta(api, title) {
	const response = await api.get({
		action: 'query',
		prop: 'revisions',
		titles: title,
		rvprop: [ 'content', 'ids', 'timestamp' ],
		rvslots: 'main',
		curtimestamp: 1,
		formatversion: 2
	});

	return extractWikitextMetaFromResponse(response);
}

export function extractWikitextFromResponse(response) {
	return extractWikitextMetaFromResponse(response).content;
}

export function extractWikitextMetaFromResponse(response) {
	const starttimestamp = typeof response?.curtimestamp === 'string' ? response.curtimestamp : undefined;
	const pageV2 = response?.query?.pages?.[0];
	const revV2 = pageV2?.revisions?.[0];
	const fromFormatVersion2 = revV2?.slots?.main?.content;
	if (typeof fromFormatVersion2 === 'string') {
		return {
			content: fromFormatVersion2,
			revid: revV2?.revid ?? undefined,
			basetimestamp: revV2?.timestamp ?? undefined,
			starttimestamp
		};
	}

	const pagesObject = response?.query?.pages;
	if (!pagesObject || typeof pagesObject !== 'object') {
		return { content: '', revid: undefined, basetimestamp: undefined, starttimestamp };
	}
	const firstPage = Object.values(pagesObject)[0];
	const revLegacy = firstPage?.revisions?.[0];
	return {
		content: revLegacy?.slots?.main?.['*'] || '',
		revid: revLegacy?.revid ?? undefined,
		basetimestamp: revLegacy?.timestamp ?? undefined,
		starttimestamp
	};
}
