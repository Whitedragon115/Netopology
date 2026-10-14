import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: ['.next/**', 'node_modules/**', 'backend/**', 'docs/**', 'public/mockServiceWorker.js', 'lib/api/schema.d.ts'],
  },
  {
    rules: {
      // CONVENTIONS.md §4.2: no default exports outside Next route files
      'import/no-default-export': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
];

export default config;
