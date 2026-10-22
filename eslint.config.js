import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '.agents/**', '.dev_db/**', '.claude/**', 'tests/load/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // ponytail: existing code uses `any` and has a few dead test vars; raise to 'error' as cleaned
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { ignoreRestSiblings: true }],
    },
  },
  {
    // strips control chars and emoji from PDF text on purpose
    files: ['apps/web/src/features/reports/ReportDocument.tsx'],
    rules: { 'no-control-regex': 'off', 'no-misleading-character-class': 'off' },
  },
);
