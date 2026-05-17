export default [
	{
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
			globals: {
				browser: true,
				console: 'readonly',
				document: 'readonly',
				event: 'readonly',
				fetch: 'readonly',
				navigator: 'readonly',
				requestAnimationFrame: 'readonly',
				window: 'readonly'
			}
		},
		rules: {
			'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
			'no-console': 'warn'
		}
	},
	{
		ignores: ['build/', '.svelte-kit/', 'node_modules/', 'pnpm-lock.yaml']
	}
];
