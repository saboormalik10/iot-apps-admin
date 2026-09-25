// ESLint 10 reads a flat config; `.eslintrc.json` is no longer loaded, so without
// this file `npm run lint` fails before it looks at a single file.
//
// The rules are the ones the old config carried over from the cloud project. The
// globals are written out rather than pulled from the `globals` package so that
// linting needs nothing that is not already installed.
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

const nodeGlobals = Object.fromEntries(
  [
    'process', 'console', 'Buffer', 'setTimeout', 'clearTimeout', 'setInterval',
    'clearInterval', 'setImmediate', 'clearImmediate', 'URL', 'URLSearchParams',
    'TextEncoder', 'TextDecoder', 'AbortController', 'AbortSignal', 'fetch',
    'structuredClone', '__dirname', '__filename', 'module', 'require', 'exports',
    'global', 'globalThis', 'queueMicrotask', 'performance',
    // Jest, for the e2e suites.
    'describe', 'it', 'test', 'expect', 'beforeAll', 'afterAll', 'beforeEach', 'afterEach', 'jest',
  ].map((name) => [name, 'readonly']),
);

export default [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: nodeGlobals,
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // TypeScript reports these itself, and the base rules misread TS syntax.
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'no-console': 'off',
    },
  },
];
