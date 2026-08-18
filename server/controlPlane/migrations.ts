import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Database } from './database.js';

export type AppliedMigrations = {
  appliedVersions: string[];
};

type MigrationFile = {
  version: string;
  filePath: string;
  sql: string;
};

export async function loadMigrationFiles(directory: string): Promise<MigrationFile[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const sqlEntries = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .sort((left, right) => left.name.localeCompare(right.name));

  return Promise.all(
    sqlEntries.map(async (entry) => {
      const filePath = path.join(directory, entry.name);
      return {
        version: entry.name.slice(0, -'.sql'.length),
        filePath,
        sql: await readFile(filePath, 'utf8'),
      };
    }),
  );
}

export async function runMigrations(
  database: Database,
  directory: string,
): Promise<AppliedMigrations> {
  await database`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(64) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;

  const appliedRows = await database<{ version: string }[]>`
    SELECT version
    FROM schema_migrations
    ORDER BY applied_at ASC, version ASC
  `;
  const appliedVersions = new Set(appliedRows.map((row) => row.version));
  const migrations = await loadMigrationFiles(directory);
  const newlyAppliedVersions: string[] = [];

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue;

    await database.begin(async (transaction) => {
      await transaction.unsafe(migration.sql);
      await transaction`
        INSERT INTO schema_migrations (version)
        VALUES (${migration.version})
      `;
    });

    newlyAppliedVersions.push(migration.version);
  }

  return { appliedVersions: newlyAppliedVersions };
}
