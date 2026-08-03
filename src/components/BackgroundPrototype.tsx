import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CircleDot, Gamepad2, Radio, Shield, Sparkles, Volume2, Zap } from 'lucide-react';

// PROTOTYPE — five background directions for the Shape Showdown client shell.
// Keep this isolated behind ?prototype=background until a direction is selected.
const VARIANTS = [
  {
    id: 'shader',
    name: 'Shader Bloom',
    kicker: 'CodePen-inspired',
    description: 'Soft, layered color fields with slow opposing motion.',
  },
  {
    id: 'aurora',
    name: 'Aurora Drift',
    kicker: 'Custom direction 01',
    description: 'A calm atmospheric wash that keeps the chrome readable.',
  },
  {
    id: 'grid',
    name: 'Neon Grid',
    kicker: 'Custom direction 02',
    description: 'Competitive arcade energy with a precise horizon line.',
  },
  {
    id: 'orbit',
    name: 'Orbit Chamber',
    kicker: 'Custom direction 03',
    description: 'A sci-fi arena built from rings, signals, and parallax glow.',
  },
  {
    id: 'ink',
    name: 'Ink Reactor',
    kicker: 'Custom direction 04',
    description: 'High-contrast ink clouds and a warmer, more editorial mood.',
  },
] as const;

type VariantId = (typeof VARIANTS)[number]['id'];

function isVariantId(value: string | null): value is VariantId {
  return VARIANTS.some((variant) => variant.id === value);
}

function readVariant(): VariantId {
  return isVariantId(new URLSearchParams(window.location.search).get('variant'))
    ? (new URLSearchParams(window.location.search).get('variant') as VariantId)
    : 'shader';
}

function PrototypeSwitcher({ current, onChange }: { current: VariantId; onChange: (next: VariantId) => void }) {
  const currentIndex = VARIANTS.findIndex((variant) => variant.id === current);
  const active = VARIANTS[currentIndex];

  const move = useCallback(
    (delta: number) => {
      const nextIndex = (currentIndex + delta + VARIANTS.length) % VARIANTS.length;
      onChange(VARIANTS[nextIndex].id);
    },
    [currentIndex, onChange],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, [contenteditable="true"]')) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        move(-1);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        move(1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [move]);

  return (
    <div className="prototype-switcher" aria-label="Background prototype switcher">
      <button type="button" aria-label="Previous background" onClick={() => move(-1)}>
        <ArrowLeft size={16} />
      </button>
      <div className="prototype-switcher-copy">
        <span>Background prototype</span>
        <strong>
          {String(currentIndex + 1).padStart(2, '0')} / {String(VARIANTS.length).padStart(2, '0')} · {active.name}
        </strong>
      </div>
      <button type="button" aria-label="Next background" onClick={() => move(1)}>
        <ArrowRight size={16} />
      </button>
    </div>
  );
}

function SignalBars() {
  return (
    <span className="prototype-signal-bars" aria-label="Strong connection">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

export const BackgroundPrototype: React.FC = () => {
  const [variant, setVariant] = useState<VariantId>(readVariant);
  const active = useMemo(() => VARIANTS.find((item) => item.id === variant) ?? VARIANTS[0], [variant]);

  const changeVariant = useCallback((next: VariantId) => {
    setVariant(next);
    const url = new URL(window.location.href);
    url.searchParams.set('prototype', 'background');
    url.searchParams.set('variant', next);
    window.history.replaceState({}, '', url);
  }, []);

  useEffect(() => {
    const onPopState = () => setVariant(readVariant());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  return (
    <div className={`prototype-root prototype-${variant}`}>
      <div className="prototype-background-art" aria-hidden="true">
        <div className="prototype-art-layer prototype-art-layer-a" />
        <div className="prototype-art-layer prototype-art-layer-b" />
        <div className="prototype-art-layer prototype-art-layer-c" />
        <div className="prototype-art-grid" />
        <div className="prototype-art-ring prototype-art-ring-a" />
        <div className="prototype-art-ring prototype-art-ring-b" />
        <div className="prototype-art-sparks" />
      </div>

      <main className="prototype-site">
        <header className="prototype-nav">
          <div className="prototype-brand">
            <span className="prototype-brand-mark"><Zap size={15} fill="currentColor" /></span>
            <span>SHAPE <b>SHOWDOWN</b></span>
          </div>
          <nav className="prototype-nav-links" aria-label="Prototype navigation">
            <span className="prototype-nav-link prototype-nav-link-active">Arena</span>
            <span className="prototype-nav-link">Loadout</span>
            <span className="prototype-nav-link">Rankings</span>
          </nav>
          <div className="prototype-nav-actions">
            <span className="prototype-live"><Radio size={13} /> LIVE CLIENT</span>
            <button type="button" className="prototype-icon-button" aria-label="Toggle sound"><Volume2 size={15} /></button>
            <div className="prototype-avatar">SS</div>
          </div>
        </header>

        <section className="prototype-intro">
          <div>
            <p className="prototype-eyebrow"><CircleDot size={12} /> SHAPE SHOWDOWN / VISUAL DIRECTION LAB</p>
            <h1>Make the arena feel <em>alive.</em></h1>
            <p className="prototype-intro-copy">A background-only client mockup. The board is intentionally omitted so the atmosphere, contrast, and chrome can be judged on their own.</p>
          </div>
          <div className="prototype-intro-meta">
            <span className="prototype-meta-label">Current direction</span>
            <strong>{active.name}</strong>
            <small>{active.description}</small>
          </div>
        </section>

        <section className="prototype-client" aria-label="Shape Showdown client mockup">
          <div className="prototype-client-topline">
            <div className="prototype-match-code"><span /> MATCH 042 <b>·</b> RANKED DUEL</div>
            <div className="prototype-match-status"><SignalBars /> 2 PLAYERS CONNECTED <span className="prototype-status-dot" /></div>
          </div>

          <div className="prototype-client-grid">
            <aside className="prototype-side-panel prototype-player-panel">
              <div className="prototype-panel-heading"><span>01 / PLAYER</span><Shield size={15} /></div>
              <div className="prototype-player-name"><span className="prototype-player-orb" /> NOVA_17</div>
              <div className="prototype-player-rank">RANK 08 <span>·</span> 2,410 ELO</div>
              <div className="prototype-stat-list">
                <div><span>WIN RATE</span><b>68.4%</b></div>
                <div><span>STREAK</span><b className="prototype-positive">+04</b></div>
                <div><span>LOADOUT</span><b>PRISM</b></div>
              </div>
              <div className="prototype-mini-meter"><span /><span /><span /><span /><span /><span /></div>
              <p className="prototype-panel-note">Your field is waiting for the first drop.</p>
            </aside>

            <div className="prototype-arena">
              <div className="prototype-arena-header"><span>ARENA SURFACE</span><span>BOARD OMITTED / BACKGROUND TEST</span></div>
              <div className="prototype-arena-surface">
                <div className="prototype-arena-halo" />
                <div className="prototype-arena-crosshair"><span /><span /></div>
                <div className="prototype-arena-signal"><Sparkles size={18} /><span>ATMOSPHERE<br /><b>ONLINE</b></span></div>
                <div className="prototype-arena-corner prototype-arena-corner-tl" />
                <div className="prototype-arena-corner prototype-arena-corner-tr" />
                <div className="prototype-arena-corner prototype-arena-corner-bl" />
                <div className="prototype-arena-corner prototype-arena-corner-br" />
              </div>
              <div className="prototype-arena-footer"><span>ACTIVE EFFECTS <b>03</b></span><span>LATENCY <b>24ms</b></span><span>ROUND TIMER <b>03:42</b></span></div>
            </div>

            <aside className="prototype-side-panel prototype-opponent-panel">
              <div className="prototype-panel-heading"><span>02 / OPPONENT</span><Gamepad2 size={15} /></div>
              <div className="prototype-player-name"><span className="prototype-player-orb prototype-player-orb-rose" /> HEXMACHINE</div>
              <div className="prototype-player-rank">RANK 11 <span>·</span> 2,685 ELO</div>
              <div className="prototype-opponent-readout"><span>INCOMING</span><strong>06</strong><small>garbage lines</small></div>
              <div className="prototype-opponent-bars"><span /><span /><span /><span /><span /><span /><span /></div>
              <p className="prototype-panel-note">Opponent signal is stable. Their next move is unreadable.</p>
            </aside>
          </div>

          <div className="prototype-client-bottomline">
            <div className="prototype-shop-strip"><span className="prototype-shop-label">SHOP</span><span className="prototype-shop-chip">WILD PURGE <b>80</b></span><span className="prototype-shop-chip">MAGNET <b>120</b></span><span className="prototype-shop-chip prototype-shop-chip-locked">LOCKED</span></div>
            <button type="button" className="prototype-enter-button">ENTER MATCH <ArrowRight size={15} /></button>
          </div>
        </section>

        <footer className="prototype-footer"><span>PROTOTYPE / BACKGROUND STUDY / NO GAMEPLAY CONNECTED</span><span>USE ← → TO CYCLE</span></footer>
      </main>

      <PrototypeSwitcher current={variant} onChange={changeVariant} />
    </div>
  );
};

