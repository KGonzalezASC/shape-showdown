import postgres from 'postgres';

export type Database = ReturnType<typeof postgres>;
export type SqlExecutor = postgres.ISql;

export type DatabaseOptions = {
  forceInMemory?: boolean;
};

const DEFAULT_POOL_SIZE = 10;
const DEFAULT_HEALTH_TIMEOUT_MS = 2_000;

export function createDatabase(
  url: string | undefined = process.env.DATABASE_URL,
  options: DatabaseOptions = {},
): Database | null {
  if (options.forceInMemory) return null;

  const trimmedUrl = url?.trim();
  if (!trimmedUrl) return null;

  return postgres(trimmedUrl, {
    max: DEFAULT_POOL_SIZE,
    idle_timeout: 20,
    connect_timeout: 5,
  });
}

export async function healthPing(
  database: Database,
  timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS,
): Promise<void> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      database`SELECT 1`,
      new Promise<never>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`Database health ping exceeded ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
}
