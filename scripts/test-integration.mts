import { createDatabase, healthPing } from '../server/controlPlane/database.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const requiresDatabase =
  process.env.CI === 'true' || process.env.CI === '1' || process.env.REQUIRE_DATABASE === '1';

if (!testDatabaseUrl) {
  console.log('[test:integration] not run: TEST_DATABASE_URL is not configured');
  process.exitCode = requiresDatabase ? 1 : 0;
} else {
  const database = createDatabase(testDatabaseUrl);
  if (database === null) {
    throw new Error('TEST_DATABASE_URL was configured but could not create a database client');
  }

  try {
    await healthPing(database);
  } catch (error) {
    console.error('[test:integration] database health check failed');
    console.error(error);
    process.exitCode = 1;
  } finally {
    await database.end({ timeout: 1 });
  }

  if (process.exitCode !== 1) {
    const result = Bun.spawn(['bun', 'scripts/run-tests.mts', 'integration'], {
      env: process.env,
      stderr: 'inherit',
      stdout: 'inherit',
    });
    process.exitCode = await result.exited;
  }
}
