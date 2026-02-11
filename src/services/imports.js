import { SUMMARY_TAG } from '@constants/config';
import { getApiForTarget } from '@services/api';
import { getSummaryForTarget } from '@utils/targets';
import { getWikitext } from '@utils/wikitext';

const URL_RGX = /^(?:https?:)?\/\/(.+?)\.org\/w\/index\.php\?.*?title=(.+?(?:&|$))/;
const IMPORT_RGX = /^\s*(\/\/)?\s*importScript\s*\(\s*(['"])\s*(.+?)\s*\2\s*\)\s*;?/;
const LOADER_RGX =
	/^\s*(\/\/)?\s*mw\s*\.\s*loader\s*\.\s*load\s*\(\s*(['"])\s*(.+?)\s*\2\s*(?:,\s*(['"])\s*(?:text\/css|application\/css|text\/javascript|application\/javascript)\s*\4\s*)?\)\s*;?/;

function decodeSafe(value) {
	try {
		return decodeURIComponent(String(value || '').replace(/&$/, ''));
	} catch {
		return String(value || '');
	}
}

export class Import {
	constructor({ page = null, wiki = null, url = null, target = 'common', disabled = false } = {}) {
		this.page = page;
		this.wiki = wiki;
		this.url = url;
		this.target = target;
		this.disabled = Boolean(disabled);
		this.type = this.url ? 2 : this.wiki ? 1 : 0;
	}

	static ofLocal(page, target, disabled = false) {
		return new Import({ page, target, disabled });
	}

	static ofUrl(url, target, disabled = false) {
		let match;
		if ((match = URL_RGX.exec(String(url || '')))) {
			return new Import({
				page: decodeSafe(match[2]),
				wiki: decodeSafe(match[1]),
				target,
				disabled
			});
		}

		return new Import({ url, target, disabled });
	}

	static fromJs(line, target = 'common') {
		let match;
		if ((match = IMPORT_RGX.exec(String(line || '')))) {
			return Import.ofLocal(match[3], target, Boolean(match[1]));
		}

		if ((match = LOADER_RGX.exec(String(line || '')))) {
			return Import.ofUrl(match[3], target, Boolean(match[1]));
		}

		return null;
	}

	toLoaderUrl(serverName) {
		if (this.type === 2) {
			return this.url;
		}

		const host = this.type === 1 ? `${this.wiki}.org` : serverName;
		const pageTitle = this.page;
		const isCss = /\.css$/i.test(String(pageTitle || ''));
		const ctype = isCss ? 'text/css' : 'text/javascript';
		return `//${host}/w/index.php?title=${pageTitle}&action=raw&ctype=${ctype}`;
	}

	toJs(serverName) {
		const disabledPrefix = this.disabled ? '//' : '';
		const url = this.toLoaderUrl(serverName);
		const isCss = /\.css($|[?#])/i.test(String(url || ''));
		const typeArg = isCss ? ", 'text/css'" : '';
		return `${disabledPrefix}mw.loader.load('${url}'${typeArg});`;
	}

	async install() {
		return this.updateInTarget('install');
	}

	async uninstall() {
		return this.updateInTarget('uninstall');
	}

	async updateInTarget(mode) {
		const target = this.target || 'common';
		const api = getApiForTarget(target);
		const title = `User:${mw.config.get('wgUserName')}/${target}.js`;
		const current = await getWikitext(api, title);
		const line = this.toJs(mw.config.get('wgServerName'));
		const exists = current.includes(line);
		let next = current;

		if (mode === 'install' && !exists) {
			next = current.trimEnd() ? `${current.trimEnd()}\n${line}\n` : `${line}\n`;
		} else if (mode === 'uninstall' && exists) {
			next = current
				.split('\n')
				.filter((candidate) => candidate.trim() !== line.trim())
				.join('\n');
		}

		if (next === current) {
			return false;
		}

		await api.postWithEditToken({
			action: 'edit',
			title,
			text: next,
			summary: `${getSummaryForTarget(target, mode)} ${SUMMARY_TAG}`,
			formatversion: 2
		});

		return true;
	}
}
