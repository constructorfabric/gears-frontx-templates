/**
 * Lint configuration for the seeded application.
 *
 * The template establishes a whole repository, so it brings its own config
 * rather than borrowing one: a project seeded from it has no other. The base
 * block is the one `template-shell/eslint.config.js` applies to every TS/TSX
 * file (its "L0 BASE" block), so code moved between the two templates is held
 * to the same rules; the shell's package-layer, flux and Studio blocks have no
 * counterpart here because this app has no packages, no store and no Studio.
 */
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '*.config.ts', '*.config.js', '.dependency-cruiser.cjs'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Plain .mjs files are Node-land tooling. js.configs.recommended enables
  // no-undef for them, and unlike TS files they get no globals from
  // typescript-eslint, so without this block `console`/`process` report as
  // undefined.
  {
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },

  // L0 BASE: universal rules for all TS/TSX files, as template-shell states them.
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2020,
        ...globals.node,
      },
    },
    plugins: {
      'unused-imports': unusedImports,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // `any` switches the checker off for everything it touches; an unknown
      // value is narrowed with a guard instead.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': true, 'ts-ignore': true, 'ts-nocheck': true, 'ts-check': false },
      ],
      '@typescript-eslint/no-empty-object-type': 'error',
      '@typescript-eslint/no-unsafe-function-type': 'error',
      '@typescript-eslint/no-wrapper-object-types': 'error',
      'prefer-const': 'error',
      'no-console': 'off',
      'no-var': 'error',
      'no-empty-pattern': 'error',
    },
  },

  // React hooks
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules, 'react-hooks/exhaustive-deps': 'error' },
  },
];
