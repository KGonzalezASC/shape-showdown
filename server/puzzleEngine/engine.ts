/**
 * Compatibility exports for server code. The deterministic puzzle simulation
 * lives in the browser-safe shared puzzle runtime.
 * Non-deterministic wall-clock server utilities are defined here.
 */
export * from '../../src/puzzle/runtime/engine.js';

export function initialSeed(): number {
  const now = Date.now();
  return (now ^ (now >>> 16)) | 0;
}

export function replayDateLabel(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hr = String(now.getHours()).padStart(2, '0');
  const mn = String(now.getMinutes()).padStart(2, '0');
  const sc = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}_${hr}-${mn}-${sc}`;
}
