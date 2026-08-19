type LogFields = Record<string, boolean | number | string | null | undefined>;

type LogLevel = 'error' | 'info' | 'warn';

const defaultTimeZone = process.env.NODE_ENV === 'production' ? 'UTC' : 'America/New_York';
const timeZone = process.env.LOG_TIME_ZONE?.trim() || defaultTimeZone;
const localTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  hourCycle: 'h23',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  month: '2-digit',
  second: '2-digit',
  timeZone,
  timeZoneName: 'short',
  year: 'numeric',
});

export function logInfo(event: string, fields: LogFields = {}): void {
  writeLog('info', event, fields);
}

export function logWarn(event: string, fields: LogFields = {}): void {
  writeLog('warn', event, fields);
}

export function logError(event: string, error: unknown, fields: LogFields = {}): void {
  const details = errorDetails(error);
  writeLog('error', event, { ...fields, ...details });
}

function writeLog(level: LogLevel, event: string, fields: LogFields): void {
  const timestamp = new Date();
  const entry = JSON.stringify({
    timestamp: timestamp.toISOString(),
    localTime: localTimeFormatter.format(timestamp),
    level,
    event,
    ...fields,
  });

  switch (level) {
    case 'error':
      console.error(entry);
      return;
    case 'warn':
      console.warn(entry);
      return;
    case 'info':
      console.log(entry);
      return;
    default: {
      const exhaustive: never = level;
      throw new Error(`Unsupported log level: ${exhaustive}`);
    }
  }
}

function errorDetails(error: unknown): LogFields {
  if (error instanceof Error) {
    const postgresCode = readErrorCode(error);
    return {
      errorName: error.name,
      errorMessage: error.message,
      ...(postgresCode === null ? {} : { postgresCode }),
    };
  }
  return { errorMessage: String(error) };
}

function readErrorCode(error: Error): string | null {
  if (!isRecord(error) || typeof error.code !== 'string') return null;
  return error.code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
