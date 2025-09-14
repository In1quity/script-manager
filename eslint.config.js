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
      indent: ['error', 2],
      quotes: ['error', 'single'],
      semi: ['error', 'never'],
      'no-tabs': 'error',
      'space-before-function-paren': ['error', 'always'],
      'space-before-blocks': 'error',
      'keyword-spacing': 'error',
      'brace-style': ['error', '1tbs'],
      'comma-spacing': 'error',
      'no-multi-spaces': 'error',
      'no-multiple-empty-lines': 'error',
      'padded-blocks': ['error', 'never'],
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
  }
]
