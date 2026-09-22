import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

/**
 * Next 16 removed `next lint`, so this is a first-class ESLint 9 flat config.
 *
 * The rule set is deliberately about *correctness*, not style: formatting
 * opinions are noise in review, whereas a floating promise or a missing hook
 * dependency is a real defect. Type-aware linting is enabled for `src` because
 * the rules that actually catch bugs here — unhandled promises, unsafe
 * comparisons — need types to work at all.
 */
export default tseslint.config(
  { ignores: ['.next/**', 'node_modules/**', 'dist/**', 'docs/**', '.data/**', 'scripts/**'] },

  js.configs.recommended,

  // Type-aware rules only where there is a TypeScript program to read. Applying
  // them globally makes ESLint try to type-check its own config file.
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.{ts,tsx}'],
  })),

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,

      /*
       * Reading persisted state after mount is the fix for the hydration
       * mismatches the audit reproduced: the server cannot know a browser's
       * stored theme or session, so the first client render must match the
       * HTML and the real value must arrive in an effect. The rule is right in
       * general and wrong for that specific, deliberate pattern, so it stays
       * visible as a warning instead of being switched off.
       */
      'react-hooks/set-state-in-effect': 'warn',
      // Fires on `ref.current = x` used to keep a callback fresh without
      // re-subscribing an effect. Legitimate, but worth seeing.
      'react-hooks/refs': 'warn',

      // An unawaited promise in a request handler is a silent data-loss bug.
      '@typescript-eslint/no-floating-promises': 'error',
      /*
       * `checksVoidReturn.attributes` is off: React ignores an event handler's
       * return value, so `onClick={async …}` is idiomatic and banning it only
       * produces `void` noise. The genuine risk it points at — an async handler
       * whose rejection nobody sees — is tracked as a real finding in the
       * coverage ledger (UI-ASYNC-REJECT) rather than papered over here.
       */
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'error',

      // `any` is load-bearing in a few places where a driver is untyped; make
      // it visible without failing the build on it.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',

      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/restrict-template-expressions': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
    },
  },

  {
    // Server code never touches browser globals; catching `window` here is the
    // point, since it would only fail at request time.
    files: ['src/server/**/*.ts', 'src/app/api/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: { 'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'sessionStorage'] },
  },

  {
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
  },

  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-restricted-globals': 'off',
      // node:test's `test()` returns a promise it manages itself; awaiting each
      // call would serialise the suite for no benefit.
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
)
