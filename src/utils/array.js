export function uniques(array) {
	return (Array.isArray(array) ? array : []).filter((item, index, source) => source.indexOf(item) === index);
}
