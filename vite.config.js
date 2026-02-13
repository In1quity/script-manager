import { defineConfig } from 'vite';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const readJson = (relativePath) => {
	const filePath = new URL(relativePath, import.meta.url);
	return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

const resolveLoaderSource = () => {
	const rootLoader = path.resolve(__dirname, 'scriptManager.js');
	if (fs.existsSync(rootLoader)) {
		return rootLoader;
	}
	return path.resolve(__dirname, 'scr', 'scriptManager.js');
};

const resolveCaptureSource = () => {
	const rootCapture = path.resolve(__dirname, 'scriptManager-capture.js');
	if (fs.existsSync(rootCapture)) {
		return rootCapture;
	}
	return path.resolve(__dirname, 'scr', 'scriptManager-capture.js');
};

const stripLeadingDocComment = (source) => {
	return String(source || '').replace(/^\s*\/\*\*[\s\S]*?\*\/\s*/, '');
};

export default defineConfig(({ command, mode }) => {
	const isProd = command === 'build' && mode === 'production';
	const isDev = command === 'serve' || mode === 'development';
	const pkg = readJson('./package.json');
	const enDict = readJson('./i18n/en.json');
	const buildDate = new Date().toISOString().slice(0, 10);
	const licenseTag = String(pkg.license || '')
		.replace(/[()]/g, '')
		.trim();
	const repositoryTag = String(pkg?.repository?.url || '')
		.replace(/\.git$/i, '')
		.trim();

	const banner = `/**
 * @file Script Manager
 * @summary MediaWiki user script installer (loader, core, capture).
 * @description Based on [[en:User:Equazcion/ScriptInstaller]]; adapted [[en:User:Enterprisey/script-installer]];
 * refactored and maintained by [[mw:User:Iniquity]].
 * @author Equazcion
 * @author Enterprisey
 * @author Iniquity
 * @license ${licenseTag || 'MIT OR CC-BY-SA-4.0'}
 * @documentation ${pkg.documentation}
 * @repository ${repositoryTag || pkg.documentation}
 * @version ${pkg.version}
 * @buildDate ${buildDate}
 */`;

	return {
		envPrefix: [ 'VITE_', 'SM_' ],
		resolve: {
			alias: {
				'@': path.resolve(__dirname, 'src'),
				'@components': path.resolve(__dirname, 'src/components'),
				'@services': path.resolve(__dirname, 'src/services'),
				'@utils': path.resolve(__dirname, 'src/utils'),
				'@constants': path.resolve(__dirname, 'src/constants'),
				'@styles': path.resolve(__dirname, 'src/styles')
			}
		},
		define: {
			SM_VERSION: JSON.stringify(pkg.version),
			SM_DOC_PAGE: JSON.stringify(pkg.documentation),
			SM_I18N_EN: JSON.stringify(enDict),
			BUILD_DATE: JSON.stringify(buildDate),
			__DEV__: isDev,
			__PROD__: isProd
		},
		plugins: [
			cssInjectedByJsPlugin(),
			{
				name: 'script-manager-minify-vue-templates',
				enforce: 'pre',
				transform(code, id) {
					if (!id.endsWith('.js') || !code.includes('template:')) {
						return null;
					}

					const templateRegex = /template:\s*`([^`]*)`/gs;
					const transformed = code.replace(templateRegex, (_match, templateContent) => {
						const minified = templateContent
							.replace(/\r?\n\s*/g, ' ')
							.replace(/\s+/g, ' ')
							.replace(/>\s+</g, '><')
							.trim();

						return `template: \`${minified}\``;
					});

					if (transformed === code) {
						return null;
					}

					return {
						code: transformed,
						map: null
					};
				}
			},
			{
				name: 'script-manager-banner',
				apply: 'build',
				enforce: 'post',
				generateBundle(_options, bundle) {
					for (const [ fileName, chunk ] of Object.entries(bundle)) {
						if (chunk.type === 'chunk' && fileName.endsWith('.js')) {
							chunk.code = `${banner}\n${chunk.code}\n`;
						}
					}
				}
			},
			{
				name: 'script-manager-copy-loader',
				apply: 'build',
				generateBundle() {
					const loaderSource = resolveLoaderSource();
					if (!fs.existsSync(loaderSource)) {
						return;
					}

					const source = stripLeadingDocComment(fs.readFileSync(loaderSource, 'utf8'));
					this.emitFile({
						type: 'asset',
						fileName: 'scriptManager.js',
						source: `${banner}\n${source}\n`
					});

					const captureSource = resolveCaptureSource();
					if (!fs.existsSync(captureSource)) {
						return;
					}
					const capture = stripLeadingDocComment(fs.readFileSync(captureSource, 'utf8'));
					this.emitFile({
						type: 'asset',
						fileName: 'scriptManager-capture.js',
						source: `${banner}\n${capture}\n`
					});
				}
			}
		],
		build: {
			emptyOutDir: true,
			lib: {
				entry: path.resolve(__dirname, 'src/App.js'),
				name: 'ScriptManager',
				fileName: () => 'scriptManager-core.js',
				formats: [ 'iife' ]
			},
			target: 'es2021',
			minify: isProd ? 'esbuild' : false,
			sourcemap: isDev,
			rollupOptions: {
				output: {
					extend: true,
					inlineDynamicImports: true,
					entryFileNames: 'scriptManager-core.js',
					chunkFileNames: 'scriptManager-core.js'
				}
			},
			reportCompressedSize: false,
			chunkSizeWarningLimit: 1000
		},
		publicDir: false
	};
});
