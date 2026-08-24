import { createDatabase, type Database } from './database.js';

export function createTestDatabase(): Database | null {
  const url = process.env.TEST_DATABASE_URL?.trim();
  if (url) process.env.DATABASE_URL = url;
  return createDatabase(url);
}
