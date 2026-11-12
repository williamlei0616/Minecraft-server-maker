import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', '.out/', '.next/', '.next-*/', 'out/', 'design/', 'docs/', '.impeccable/', 'tests/fixtures/', 'public/versions.json'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['scripts/**/*.mjs', 'tools/**/*.mjs', 'tests/**/*.mjs', '*.mjs', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
);
