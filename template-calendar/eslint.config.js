/**
 * FrontX Template ESLint Configuration (template-calendar/, self-contained)
 *
 * Covers @gears-frontx/calendar-kit. The base blocks mirror the ecosystem
 * root's L0 and React hooks rules; the calendar-kit blocks carry the import
 * boundaries the package had in gears-frontx.
 */

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import unusedImports from 'eslint-plugin-unused-imports';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const ROUTER_ENGINE_BAN = {
  group: ['@tanstack/*', '!@tanstack/react-table'],
  message:
    'ECOSYSTEM VIOLATION ([sole router engine constraint](https://github.com/constructorfabric/gears-frontx/blob/develop/architecture/DECOMPOSITION.md)): only @gears-frontx/routing-tanstack may import a concrete router engine.',
};

const PACKAGE_INTERNALS_BAN = {
  group: ['@gears-frontx/*/src/**'],
  message: 'MONOREPO VIOLATION: Import from package root, not internal paths.',
};

const ALIAS_BAN = {
  group: ['@/*'],
  message: 'PACKAGE VIOLATION: Use relative imports within packages.',
};

const TEMPLATE_TERRITORY_BAN = {
  group: ['@gears-frontx-templates/*', '@gears-frontx-templates/*/*'],
  message:
    'ECOSYSTEM VIOLATION: @gears-frontx/calendar-kit must not import template territory.',
};

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: ['**/dist/**', '**/dist-tests/**', '**/coverage/**', '**/node_modules/**', '**/*.config.*', '**/*.cjs'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

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

  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules, 'react-hooks/exhaustive-deps': 'error' },
  },

  // `src/ui/primitives/` alone may import `@gears-frontx/ui-kit`; every other
  // source file holds no intra-ecosystem edge. ui-kit style imports are
  // forbidden anywhere: calendar-kit ships its own theme.css.
  {
    files: ['packages/calendar-kit/src/**/*.ts', 'packages/calendar-kit/src/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@gears-frontx/*', '@gears-frontx/*/*'],
              message:
                'ECOSYSTEM VIOLATION: @gears-frontx/calendar-kit holds no intra-ecosystem package dependency here — only files under src/ui/primitives/ may import @gears-frontx/ui-kit.',
            },
            TEMPLATE_TERRITORY_BAN,
            ROUTER_ENGINE_BAN,
            PACKAGE_INTERNALS_BAN,
            ALIAS_BAN,
          ],
        },
      ],
    },
  },

  // Placed after the block above so its narrower ecosystem pattern wins.
  {
    files: ['packages/calendar-kit/src/ui/primitives/**/*.ts', 'packages/calendar-kit/src/ui/primitives/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@gears-frontx/*', '@gears-frontx/*/*', '!@gears-frontx/ui-kit', '!@gears-frontx/ui-kit/*'],
              message:
                'ECOSYSTEM VIOLATION: src/ui/primitives/ imports exactly one ecosystem package — @gears-frontx/ui-kit — and no other.',
            },
            // The negation above re-allows every ui-kit subpath, CSS included.
            {
              group: ['@gears-frontx/ui-kit/**/*.css'],
              message:
                'ECOSYSTEM VIOLATION: calendar-kit ships its own theme.css; do not import ui-kit styles.',
            },
            TEMPLATE_TERRITORY_BAN,
            ROUTER_ENGINE_BAN,
            PACKAGE_INTERNALS_BAN,
            ALIAS_BAN,
          ],
        },
      ],
    },
  },

  // The demo and the a11y suite consume the package by name. Only the
  // self-package ban is lifted; the src-internals and alias bans stay, so they
  // keep validating the public surface.
  {
    files: [
      'packages/calendar-kit/demo/**/*.ts',
      'packages/calendar-kit/demo/**/*.tsx',
      'packages/calendar-kit/__tests__/**/*.ts',
      'packages/calendar-kit/__tests__/**/*.tsx',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [PACKAGE_INTERNALS_BAN, ALIAS_BAN, ROUTER_ENGINE_BAN],
        },
      ],
    },
  },
];
