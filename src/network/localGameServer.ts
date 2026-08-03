export function localDevelopmentGameServerUrl(
  pageOrigin: string,
  hostname: string,
  isDevelopment: boolean,
): string | null {
  if (!isDevelopment) return null;
  return hostname === 'localhost' || hostname === '127.0.0.1'
    ? pageOrigin
    : null;
}
