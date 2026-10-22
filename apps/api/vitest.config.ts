import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'], exclude: ['dist/**', 'node_modules/**'], testTimeout: 30000,
    // files share one DB and assert on global audit_logs rows; parallel files race
    fileParallelism: false,
  },
});
