import React, { useState, useEffect } from 'react';
import { ShopItem } from '../types';

const MOCK_ITEMS: ShopItem[] = [
  { id: '1', name: 'Time Slow', icon: '⏰', cost: 50, tier: 1, baseWeight: 1, colorClass: 'text-amber-300', borderColorClass: 'border-amber-500/30', description: 'Slows time briefly.' },
  { id: '2', name: 'Freeze', icon: '❄️', cost: 75, tier: 1, baseWeight: 1, colorClass: 'text-blue-300', borderColorClass: 'border-blue-500/30', description: 'Freezes opponent field.' },
  { id: '3', name: 'Target', icon: '🎯', cost: 60, tier: 1, baseWeight: 1, colorClass: 'text-rose-300', borderColorClass: 'border-rose-500/30', description: 'Targets opponent piece.' },
  { id: '4', name: 'Shield', icon: '🛡️', cost: 40, tier: 1, baseWeight: 1, colorClass: 'text-emerald-300', borderColorClass: 'border-emerald-500/30', description: 'Blocks incoming attack.' },
  { id: '5', name: 'Bomb', icon: '💣', cost: 90, tier: 2, baseWeight: 1, colorClass: 'text-purple-300', borderColorClass: 'border-purple-500/30', description: 'Clears nearby cells.' },
];

const baseItemClass = 'flex w-full items-center justify-between border-2 h-9 px-2 transition-all duration-200 opacity-95';

function getHighlightClass(variation: number, isHighlighted: boolean, item: ShopItem): string {
  if (!isHighlighted) {
    return `${item.colorClass} ${item.borderColorClass} bg-transparent scale-100`;
  }

  switch (variation) {
    case 1:
      return `${item.colorClass} border-cyan-400 bg-cyan-950/40 shadow-[0_0_15px_rgba(34,211,238,0.6)] scale-[1.05] z-10`;
    case 2:
      return 'text-black border-white bg-white shadow-[4px_4px_0px_#22d3ee] scale-[1.02] -translate-y-1 z-10 font-black';
    case 3:
      return `${item.colorClass} border-transparent bg-fuchsia-950/60 shadow-[0_0_20px_#d946ef,inset_0_0_10px_#d946ef] scale-[1.1] z-10 animate-pulse ring-2 ring-fuchsia-400`;
    case 4:
      return 'text-amber-200 border-amber-300/80 bg-gradient-to-r from-amber-950/80 to-black shadow-[0_0_12px_rgba(251,191,36,0.4)] scale-[1.04] z-10';
    case 5:
      return 'text-cyan-300 border-y-magenta-500 border-x-cyan-500 border-2 bg-zinc-900 shadow-[0_0_10px_#0ff,-2px_0_10px_#f0f] scale-[1.06] z-10 skew-x-[-2deg]';
    default:
      return '';
  }
}

interface ShopRailItemProps {
  variation: number;
  title: string;
  desc: string;
  cycleIndex: number;
}

const ShopRailItem: React.FC<ShopRailItemProps> = ({ variation, title, desc, cycleIndex }) => (
  <div className="flex flex-col gap-2 p-4 border border-zinc-800 rounded-xl bg-black/50 w-48">
    <div className="text-xs font-bold text-zinc-300 mb-1">{title}</div>
    <div className="text-[9px] text-zinc-500 leading-tight h-8">{desc}</div>

    <div className="w-full select-none">
      <div className="rounded-lg border border-cyan-500/30 bg-[#10161b]/90 shadow-xl backdrop-blur p-2">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-cyan-300/85">Shop</p>
        </div>
        <div className="space-y-1 relative">
          {MOCK_ITEMS.map((item, idx) => {
            const isHighlighted = idx === cycleIndex;
            const styleClasses = getHighlightClass(variation, isHighlighted, item);

            return (
              <div key={item.id} className={`${baseItemClass} ${styleClasses}`}>
                <span className="text-lg leading-none">{item.icon}</span>
                <span className="font-mono text-[9px]">{item.cost}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  </div>
);

export const ShopRailVariations: React.FC = () => {
  const [cycleIndex, setCycleIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCycleIndex((prev) => (prev + 1) % MOCK_ITEMS.length);
    }, 700);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-zinc-950 p-8 text-white flex flex-col items-center">
      <h1 className="text-2xl font-bold mb-2">Shop Rail Highlight Variations</h1>
      <p className="text-zinc-400 mb-8">Press 'V' to exit back to the game.</p>

      <div className="flex flex-wrap gap-6 justify-center max-w-6xl">
        <ShopRailItem variation={1} title="1. Enhanced Original" desc="Slightly stronger cyan glow, better scaling." cycleIndex={cycleIndex} />
        <ShopRailItem variation={2} title="2. Brutalist Offset" desc="Sharp white/black inversion with hard offset cyan shadow." cycleIndex={cycleIndex} />
        <ShopRailItem variation={3} title="3. Maximalist Neon" desc="Aggressive fuchsia ring, deep glow, and pulse animation." cycleIndex={cycleIndex} />
        <ShopRailItem variation={4} title="4. Luxury Gold" desc="Refined amber gradient, elegant shadow and scale." cycleIndex={cycleIndex} />
        <ShopRailItem variation={5} title="5. Cyberpunk" desc="Harsh angles, magenta/cyan mix, slight skew." cycleIndex={cycleIndex} />
      </div>
    </div>
  );
};
