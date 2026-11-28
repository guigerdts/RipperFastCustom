import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'dist-legacy/**', 'node_modules/**', 'coverage/**', 'odd/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['scripts/**/*.mjs', '*.config.mjs', '*.config.js'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
    // Build scripts are CLI tools: their stdout is their output.
    rules: { 'no-console': 'off' },
  },
  prettier,
);
