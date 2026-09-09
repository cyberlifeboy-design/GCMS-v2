import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Integration tests (*.workflow.test.ts) mount the full app and wipe a live
    // database in beforeEach. They need a dedicated test database and are not
    // safe to run against the dev DB. They are excluded until Phase 7 stands up
    // a proper test-DB harness; unit tests run by default.
    exclude: ['**/node_modules/**', '**/*.workflow.test.ts'],
    globals: false,
  },
});
