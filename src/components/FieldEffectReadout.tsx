import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ActiveFieldEffect, FieldEffectKind } from '../types';
import { getChromeSnapshot, subscribeChrome } from '../state/gameStateStore';
import './FieldEffectReadout.css';

type EffectCopy = { name: string; detail: string; phase: 'Incoming' | 'Active' | 'Applied'; helpful?: boolean };
const EFFECT_COPY: Record<FieldEffectKind, EffectCopy> = {
  retrim: { name: 'Re-Trim', detail: 'Your swap line is moving up one row permanently.', phase: 'Applied' },
  'curtain-warn': { name: 'Curtain', detail: 'Frost will cover your field below the swap line.', phase: 'Incoming' },
  curtain: { name: 'Curtain', detail: 'Your lower field is covered by frost.', phase: 'Active' },
  poison: { name: 'Elixir', detail: 'A poisoned piece infects your stack when it locks.', phase: 'Applied' },
  'storage-poison': { name: 'Contagion', detail: 'Your stored piece will spread poison when it locks.', phase: 'Applied' },
  'purge-warn': { name: 'Wild Purge', detail: 'Marked poison cells are about to disappear.', phase: 'Incoming' },
  purge: { name: 'Wild Purge', detail: 'The selected poison colour was removed from your stack.', phase: 'Applied' },
  freeze: { name: 'Freeze', detail: 'Storage and swapping are locked.', phase: 'Active' },
  magnet: { name: 'Magnet', detail: 'Your pieces fall faster. Permanent pull lasts for the match.', phase: 'Applied' },
  snag: { name: 'Snag', detail: 'Hard drop is blocked until this piece locks.', phase: 'Applied' },
  sticky: { name: 'Sticky', detail: 'Moving this piece gives you fewer lock-delay resets.', phase: 'Active' },
  satellite: { name: 'Satellite', detail: 'Incoming garbage is delayed when Satellite activates.', phase: 'Active', helpful: true },
  bomber: { name: 'Bomber', detail: 'Your armed piece blasts nearby cells when it locks.', phase: 'Applied', helpful: true },
  taxed: { name: 'Bounty Tax', detail: 'A tax effect was applied to your field.', phase: 'Applied' },
  'tax-siphon': { name: 'Tax Evasion', detail: 'Shop prices were reduced, or free purchases granted.', phase: 'Applied', helpful: true },
  'curtain-def': { name: 'Curtain defense', detail: 'An extra row stays visible through future Curtains.', phase: 'Applied', helpful: true },
  'wildcard-four': { name: 'Wildcard +4', detail: 'Poison cells become the shape of an upcoming piece.', phase: 'Incoming' },
  'tectonic-shift': { name: 'Tectonic Shift', detail: 'Your stack is shifting to close gaps.', phase: 'Applied', helpful: true },
};
const getClock = () => Math.floor(getChromeSnapshot().tick / 6) * 6;
const getServerClock = () => 0;

function effectTiming(effect: ActiveFieldEffect, tick: number): string | null {
  if (effect.expiresAtTick === undefined) return null;
  // Notification expiry is not the duration of permanent or piece-bound effects.
  if (!['curtain-warn', 'purge-warn', 'curtain', 'freeze'].includes(effect.kind)) return null;
  const seconds = Math.max(0, Math.ceil((effect.expiresAtTick - tick) / 60));
  return EFFECT_COPY[effect.kind].phase === 'Incoming' ? `in ${seconds}s` : `${seconds}s left`;
}

function EffectNotice({ effect, count, currentTick, compactOnly }: {
  effect: ActiveFieldEffect; count: number; currentTick: number; compactOnly: boolean;
}) {
  const [settled, setCompact] = useState(false);
  const compact = compactOnly || settled;
  const noticeRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (compactOnly) return;
    const notice = noticeRef.current;
    if (!notice) return;
    let timer: number | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      window.clearTimeout(timer);
      if (entry.intersectionRatio >= 0.95) {
        timer = window.setTimeout(() => { setCompact(true); observer.disconnect(); }, 3500);
      }
    }, { root: notice.closest('.field-alert-list'), threshold: 0.95 });
    observer.observe(notice);
    return () => { window.clearTimeout(timer); observer.disconnect(); };
  }, [compactOnly]);
  const copy = EFFECT_COPY[effect.kind];
  const timing = effectTiming(effect, currentTick);
  return (
    <article ref={noticeRef} className="field-alert"
      data-compact={compact} aria-label={compactOnly ? `${copy.phase}: ${copy.name}` : `${copy.phase}: ${copy.name}. ${copy.detail}`}>
      <div className="field-alert-heading">
        <span className="field-alert-phase">{copy.phase}</span>
        {timing && <span className="field-alert-time">{timing}</span>}
      </div>
      <div className="field-alert-title">
        {compact && <span className="field-alert-prefix">{copy.phase === 'Incoming' ? 'Inc' : copy.phase}:</span>}
        <strong>{!compact && effect.icon && <span aria-hidden="true">{effect.icon} </span>}{copy.name}{count > 1 ? ` ×${count}` : ''}</strong>
        {compact && timing && <span className="field-alert-time">{timing}</span>}
      </div>
      {!compactOnly && <p className="field-alert-description">{copy.detail}</p>}
    </article>
  );
}

export function FieldEffectReadout({ effects, tick, fieldTitle, compactOnly = false }: {
  effects: ActiveFieldEffect[]; tick?: number; fieldTitle: string; compactOnly?: boolean;
}) {
  const liveTick = useSyncExternalStore(subscribeChrome, getClock, getServerClock);
  const currentTick = tick ?? liveTick;
  const grouped = new Map<string, { effect: ActiveFieldEffect; count: number }>();
  for (const effect of effects) {
    if (effect.expiresAtTick !== undefined && effect.expiresAtTick <= currentTick) continue;
    const key = `${effect.kind}:${effect.label}`;
    const previous = grouped.get(key);
    if (previous) { previous.count += 1; previous.effect = effect; }
    else grouped.set(key, { effect, count: 1 });
  }
  const priority = (effect: ActiveFieldEffect) => EFFECT_COPY[effect.kind].phase === 'Incoming' ? 0 : EFFECT_COPY[effect.kind].helpful ? 2 : 1;
  const entries = [...grouped.values()].sort((a, b) => priority(a.effect) - priority(b.effect));
  if (entries.length === 0) return null;
  return (
    <section className={`field-alert-stack${compactOnly ? ' field-alert-stack--compact' : ''}`} aria-label={`${fieldTitle} power-ups`}>
      <ul className="field-alert-list" tabIndex={0} aria-label="Incoming and applied effects">
        {entries.map(({ effect, count }) => <li key={`${effect.id}:${count}`}><EffectNotice compactOnly={compactOnly} effect={effect} count={count} currentTick={currentTick} /></li>)}
      </ul>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {entries.map(({ effect }) => `${EFFECT_COPY[effect.kind].phase}: ${EFFECT_COPY[effect.kind].name}. ${compactOnly ? '' : EFFECT_COPY[effect.kind].detail}`).join(' ')}
      </span>
    </section>
  );
}
