import { defineConfig } from 'vitest/config';

// Separate config for the one integration test that mounts the full app and wipes
// tables in beforeEach. Run explicitly via `npm run test:workflow` with DATABASE_URL
// pointed at a disposable Postgres database — never the dev or prod database. See
// docs/deployment/azure-container-apps.md -> "Running the workflow test".
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/modules/maintenance/maintenance.workflow.test.ts'],
    globals: false,
    testTimeout: 20000,
  },
});
