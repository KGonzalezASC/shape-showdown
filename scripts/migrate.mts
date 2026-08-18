import 'dotenv/config';
import path from 'node:path';
import { createDatabase } from '../server/controlPlane/database.js';
import { runMigrations } from '../server/controlPlane/migrations.js';

const database = createDatabase();
if (database === null) {
  throw new Error('DATABASE_URL is required to run database migrations');
}

try {
  const directory = path.join(process.cwd(), 'db', 'migrations');
  const result = await runMigrations(database, directory);
  console.log(
    result.appliedVersions.length === 0
      ? 'Database is already up to date.'
      : `Applied migrations: ${result.appliedVersions.join(', ')}`,
  );
} finally {
  await database.end({ timeout: 1 });
}
