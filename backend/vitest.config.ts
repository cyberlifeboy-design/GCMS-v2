import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Integration tests (*.workflow.test.ts) mount the full app and wipe a live
    // database in beforeEach. Run them explicitly with `npm run test:workflow`
    // against a disposable Postgres DATABASE_URL (see docs/deployment/
    // azure-container-apps.md -> "Running the workflow test"). Excluded from the
    // default unit-test run so `npm test` never touches a real database.
    exclude: ['**/node_modules/**', '**/*.workflow.test.ts'],
    globals: false,
  },
});
