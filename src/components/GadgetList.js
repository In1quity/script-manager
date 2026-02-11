export function groupGadgetsBySection(gadgets) {
	const grouped = {};
	for (const gadget of gadgets || []) {
		const section = gadget?.section || 'default';
		if (!grouped[section]) {
			grouped[section] = [];
		}
		grouped[section].push(gadget);
	}
	return grouped;
}
