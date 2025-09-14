import prettier from 'eslint-config-prettier'

export default [
	{
		ignores: ['node_modules/**', 'extra_scr/**']
	},
	{
		languageOptions: {
			ecmaVersion: 2017,
			sourceType: 'module',
			globals: {
				browser: true,
				es2021: true,
				node: true,
				mw: 'readonly',
				jQuery: 'readonly',
				$: 'readonly'
			}
		},
		rules: {
			'no-unused-vars': 'warn',
			'no-console': 'off',
			'no-tabs': 'off',
			indent: ['error', 'tab'],
			'object-shorthand': 'warn',
			'prefer-const': 'warn',
			'no-var': 'warn',
			camelcase: 'off',
			'no-useless-escape': 'error',
			'prefer-regex-literals': 'error',
			'no-mixed-operators': 'error',
			'no-throw-literal': 'error',
			'no-redeclare': 'error'
		}
	},
	prettier
]
