// Konfigurasi ESLint (flat config) SI-PAKAINGE MONSA — Fase 3.
// Fokus jaring pengaman: `no-undef` (kelas bug React.useEffect tanpa import)
// dan rules React Hooks sebagai ERROR; sisanya ringan (warning).
// Berkas .mjs agar Node membacanya langsung sebagai ES module (tanpa warning
// MODULE_TYPELESS_PACKAGE_JSON).
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'android/**',
      '../web_bundle/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      // --- Error (harus nol temuan) ---
      'no-undef': 'error',
      'react-hooks/rules-of-hooks': 'error',
      // --- Warning (dicatat, tidak menggagalkan lint) ---
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-constant-condition': ['warn', { checkLoops: false }],
    },
  },
];
