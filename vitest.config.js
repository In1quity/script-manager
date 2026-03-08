import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));
const enDict = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'i18n/en.json'), 'utf8'));

export default defineConfig({
	test: {
		environment: 'jsdom',
		include: [ 'src/**/*.test.js' ]
	},
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
		SM_VERSION: JSON.stringify(packageJson.version),
		SM_DOC_PAGE: JSON.stringify(packageJson.documentation),
		SM_I18N_EN: JSON.stringify(enDict),
		BUILD_DATE: JSON.stringify('1970-01-01'),
		__DEV__: JSON.stringify(true),
		__PROD__: JSON.stringify(false)
	}
});
