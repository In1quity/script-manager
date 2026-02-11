import stylistic from '@stylistic/eslint-plugin';
import json from '@eslint/json';
import markdown from '@eslint/markdown';
import esx from 'eslint-plugin-es-x';
import jsdoc from 'eslint-plugin-jsdoc';
import jsonc from 'eslint-plugin-jsonc';
import security from 'eslint-plugin-security';
import unicorn from 'eslint-plugin-unicorn';

export default [
	{
		ignores: [ 'node_modules/**', 'extra_scr/**' ]
	},
	{
		name: 'script-manager/javascript',
		files: [ '*.js', 'scr/**/*.js' ],
		plugins: {
			'@stylistic': stylistic,
			unicorn,
			security,
			'es-x': esx,
			jsdoc
		},
		languageOptions: {
			ecmaVersion: 2021,
			sourceType: 'module',
			globals: {
				mw: 'readonly',
				jQuery: 'readonly',
				$: 'readonly',
				OO: 'readonly',
				window: 'readonly',
				document: 'readonly',
				console: 'readonly',
				localStorage: 'readonly',
				setTimeout: 'readonly',
				clearTimeout: 'readonly',
				setInterval: 'readonly',
				clearInterval: 'readonly',
				URL: 'readonly',
				URLSearchParams: 'readonly',
				fetch: 'readonly'
			}
		},
		settings: {
			'es-x': {
				aggressive: true
			}
		},
		linterOptions: {
			reportUnusedDisableDirectives: 'warn'
		},
		rules: {
			'@stylistic/array-bracket-spacing': [ 'error', 'always' ],
			'@stylistic/block-spacing': [ 'error', 'always' ],
			'@stylistic/brace-style': [ 'error', '1tbs', { allowSingleLine: true } ],
			'@stylistic/comma-dangle': [ 'error', 'never' ],
			'@stylistic/comma-spacing': [ 'error', { before: false, after: true } ],
			'@stylistic/eol-last': [ 'error', 'always' ],
			'@stylistic/function-call-spacing': [ 'error', 'never' ],
			'@stylistic/indent': [ 'error', 'tab', { SwitchCase: 1 } ],
			'@stylistic/key-spacing': [ 'error', { beforeColon: false, afterColon: true } ],
			'@stylistic/keyword-spacing': [ 'error', { before: true, after: true } ],
			'@stylistic/linebreak-style': [ 'error', 'unix' ],
			'@stylistic/no-multiple-empty-lines': [ 'error', { max: 1, maxEOF: 1 } ],
			'@stylistic/no-trailing-spaces': 'error',
			'@stylistic/object-curly-spacing': [ 'error', 'always' ],
			'@stylistic/quotes': [ 'error', 'single', { avoidEscape: true } ],
			'@stylistic/semi': [ 'error', 'always' ],
			'@stylistic/space-before-function-paren': [
				'error',
				{
					anonymous: 'never',
					named: 'never',
					asyncArrow: 'always'
				}
			],
			'@stylistic/space-infix-ops': 'error',
			camelcase: 'off',
			eqeqeq: 'error',
			'jsdoc/require-jsdoc': 'off',
			'no-console': 'off',
			'no-mixed-operators': 'error',
			'no-redeclare': 'error',
			'no-throw-literal': 'error',
			'no-unused-vars': [ 'warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' } ],
			'no-useless-escape': 'error',
			'object-shorthand': 'warn',
			'prefer-const': 'warn',
			'prefer-regex-literals': 'error',
			'security/detect-object-injection': 'off',
			'unicorn/prefer-optional-catch-binding': 'warn',
			'no-var': 'warn'
		}
	},
	{
		name: 'script-manager/json',
		files: [ '**/*.json' ],
		ignores: [ 'package-lock.json' ],
		language: 'json/json',
		plugins: {
			json,
			jsonc
		}
	},
	{
		name: 'script-manager/markdown',
		files: [ '**/*.md' ],
		plugins: {
			markdown
		},
		processor: 'markdown/markdown'
	}
];
