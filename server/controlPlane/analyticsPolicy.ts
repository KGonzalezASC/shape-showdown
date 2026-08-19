export const ANALYTICS_EVENT_NAMES = [
  'queue_enter',
  'match_start',
  'match_end',
  'disconnect_start',
  'reconnect_success',
  'forfeit_abandon',
  'match_voided',
  'restore_ok',
  'protocol_mismatch',
  'shop_purchase',
] as const;

export type AnalyticsEventName = typeof ANALYTICS_EVENT_NAMES[number];
export type AnalyticsProperty = string | number | boolean;
export type AnalyticsProperties = Record<string, AnalyticsProperty>;

const PROPERTY_ALLOWLIST: Record<AnalyticsEventName, readonly string[]> = {
  queue_enter: ['auth_provider', 'queue_duration_ms'],
  match_start: ['is_rematch'],
  match_end: ['winner_id', 'reason', 'duration_s'],
  disconnect_start: ['pause_count'],
  reconnect_success: ['disconnected_seconds'],
  forfeit_abandon: ['total_paused_seconds'],
  match_voided: ['reason'],
  restore_ok: ['restored_tick', 'checkpoint_version'],
  protocol_mismatch: ['code', 'protocol_version'],
  shop_purchase: ['item_id', 'cost', 'tick'],
};

export function isAnalyticsEventName(value: unknown): value is AnalyticsEventName {
  return typeof value === 'string'
    && ANALYTICS_EVENT_NAMES.some((eventName) => eventName === value);
}

export function validateAnalyticsProperties(
  eventName: AnalyticsEventName,
  value: unknown,
): AnalyticsProperties | null {
  if (value === undefined) return {};
  if (!isRecord(value) || Object.keys(value).length > 12) return null;

  const allowedProperties = new Set(PROPERTY_ALLOWLIST[eventName]);
  const properties: AnalyticsProperties = {};
  for (const [key, property] of Object.entries(value)) {
    if (
      !/^[a-z][a-z0-9_]{0,31}$/u.test(key)
      || !allowedProperties.has(key)
      || !isAnalyticsProperty(property)
    ) {
      return null;
    }
    properties[key] = property;
  }
  return properties;
}

function isAnalyticsProperty(value: unknown): value is AnalyticsProperty {
  return (
    typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
