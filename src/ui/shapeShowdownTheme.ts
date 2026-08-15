export type StatusPillVariant = 'red' | 'white';
export type FieldRole = 'self' | 'opponent';

export const ssStatusPillClasses = {
  base: 'ss-status-pill',
  red: 'ss-status-pill ss-status-pill--red',
  white: 'ss-status-pill ss-status-pill--white',
  row: 'ss-status-pill-row',
} as const;

export function statusPillClass(variant: StatusPillVariant): string {
  return variant === 'red' ? ssStatusPillClasses.red : ssStatusPillClasses.white;
}

export function fieldShellClass(role: FieldRole): string {
  return role === 'self' ? 'ss-field-shell--self' : 'ss-field-shell--opponent';
}

export function fieldFrameClass(role: FieldRole): string {
  return role === 'self' ? 'ss-field-frame--self' : 'ss-field-frame--opponent';
}

export function fieldTitleClass(role: FieldRole): string {
  return role === 'self' ? 'text-[var(--ss-self)]' : 'text-[var(--ss-opponent)]';
}

export const ssShopClasses = {
  panel: 'border border-[var(--ss-shop-border)] bg-[var(--ss-shop-panel-fill)]',
  headerTitle: 'font-black uppercase tracking-[0.08em] text-[var(--ss-shop-accent)]',
  headerFunds: 'ss-mono tabular-nums text-[var(--ss-shop-accent-strong)]',
  row: 'border border-[var(--ss-shop-row-border)] bg-[var(--ss-shop-row-fill)]',
  rowHighlighted: 'border-[var(--ss-shop-accent)] bg-[var(--ss-shop-row-highlight-fill)]',
  rowUnaffordable: 'border-[var(--ss-danger-border)] bg-[var(--ss-shop-row-danger-fill)] text-[var(--ss-shop-danger-text)]',
  rowIcon: 'leading-none text-[var(--ss-shop-icon)]',
  rowIconMuted: 'leading-none text-[var(--ss-shop-icon-muted)]',
  rowName: 'truncate font-extrabold text-[var(--ss-shop-name)]',
  rowPrice: 'ss-mono tabular-nums text-[var(--ss-shop-price)]',
  rowMeta: 'ss-mono leading-tight text-[var(--ss-shop-meta)]',
  confirmButton:
    'border border-[var(--ss-shop-border)] bg-[var(--ss-shop-confirm-fill)] font-black uppercase tracking-[0.08em] text-[var(--ss-shop-accent-strong)] transition hover:brightness-110 active:brightness-95',
  waitBadge:
    'border border-[var(--ss-shop-border)] bg-[var(--ss-shop-wait-fill)] ss-mono uppercase tracking-wider text-[var(--ss-shop-accent-strong)]',
} as const;
