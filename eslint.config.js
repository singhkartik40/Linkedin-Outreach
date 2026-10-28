import sonarjs from 'eslint-plugin-sonarjs';
import security from 'eslint-plugin-security';
import tsParser from '@typescript-eslint/parser';
import { fixupConfigRules } from '@eslint/compat';

export default [
  { ignores: ['node_modules/**', 'dist/**', '.data/**', 'test-results/**', 'security-reports/**'] },
  {
    ...sonarjs.configs.recommended,
    files: ['src/**/*.{ts,tsx}', 'server/**/*.mjs', 'chrome-extension/**/*.js', 'sheets/**/*.gs', 'scripts/**/*.{js,mjs,cjs}', 'tests/**/*.{js,mjs,cjs}'],
  },
  {
    ...fixupConfigRules(security.configs.recommended)[0],
    files: ['src/**/*.{ts,tsx}', 'server/**/*.mjs', 'chrome-extension/**/*.js', 'sheets/**/*.gs', 'scripts/**/*.{js,mjs,cjs}', 'tests/**/*.{js,mjs,cjs}'],
  },
  { files: ['src/**/*.{ts,tsx}'], languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } } },
  { files: ['chrome-extension/**/*.js', 'sheets/**/*.gs'], languageOptions: { sourceType: 'script' } },
];
