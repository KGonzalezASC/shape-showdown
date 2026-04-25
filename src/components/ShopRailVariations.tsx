import React, { useState, useEffect } from 'react';
import { ShopItem } from '../types';

const MOCK_ITEMS: ShopItem[] = [
  { id: '1', name: 'Time Slow', icon: '⏰', cost: 50, probability: 1, type: 'utility', colorClass: 'text-amber-300', borderColorClass: 'border-amber-500/30' },
  { id: '2', name: 'Freeze', icon: '❄️', cost: 75, probability: 1, type: 'attack', colorClass: 'text-blue-300', borderColorClass: 'border-blue-500/30' },
  { id: '3', name: 'Target', icon: '🎯', cost: 60, probability: 1, type: 'attack', colorClass: 'text-rose-300', borderColorClass: 'border-rose-500/30' },
  { id: '4', name: 'Shield', icon: '🛡️', cost: 40, probability: 1, type: 'defense', colorClass: 'text-emerald-300', borderColorClass: 'border-emerald-500/30' },
  { id: '5', name: 'Bomb', icon: '💣', cost: 90, probability: 1, type: 'attack', colorClass: 'text-purple-300', borderColorClass: 'border-purple-500/30' },
];

export const ShopRailVariations: React.FC = () => {
  const [cycleIndex, setCycleIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCycleIndex((prev) => (prev + 1) % MOCK_ITEMS.length);
    }, 700);
    return () => clearInterval(interval);
  }, []);

  const baseItemClass = "flex w-full items-center justify-between border-2 h-9 px-2 transition-all duration-200 opacity-95";

  const getHighlightClass = (variation: number, isHighlighted: boolean, item: ShopItem) => {
    if (!isHighlighted) {
      return `${item.colorClass} ${item.borderColorClass} bg-transparent scale-100`;
    }

    switch (variation) {
      case 1:
        // Current/Original (but enhanced slightly): Subtle cyan glow
        return `${item.colorClass} border-cyan-400 bg-cyan-950/40 shadow-[0_0_15px_rgba(34,211,238,0.6)] scale-[1.05] z-10`;
      
      case 2:
        // Brutalist High-Contrast: Harsh white/black inversion with sharp offset shadow
        return `text-black border-white bg-white shadow-[4px_4px_0px_#22d3ee] scale-[1.02] -translate-y-1 z-10 font-black`;
      
      case 3:
        // Maximalist Neon: Over-the-top vibrating neon gradient border and pulse
        return `${item.colorClass} border-transparent bg-fuchsia-950/60 shadow-[0_0_20px_#d946ef,inset_0_0_10px_#d946ef] scale-[1.1] z-10 animate-pulse ring-2 ring-fuchsia-400`;
      
      case 4:
        // Luxury Refined: Gold accented, smooth breathing, glass reflection
        return `text-amber-200 border-amber-300/80 bg-gradient-to-r from-amber-950/80 to-black shadow-[0_0_12px_rgba(251,191,36,0.4)] scale-[1.04] z-10`;
      
      case 5:
        // Cyberpunk Glitch: Scanline bg, harsh magenta/cyan borders
        return `text-cyan-300 border-y-magenta-500 border-x-cyan-500 border-2 bg-zinc-900 shadow-[0_0_10px_#0ff,-2px_0_10px_#f0f] scale-[1.06] z-10 skew-x-[-2deg]`;
      
      default:
        return '';
    }
  };

  const renderRail = (variation: number, title: string, desc: string) => (
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
                <div
                  key={item.id}
                  className={`${baseItemClass} ${styleClasses}`}
                >
                  <span className="text-lg leading-none">{item.icon}</span>
                  <span className="font-mono text-[9px]">
                    {item.cost}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-zinc-950 p-8 text-white flex flex-col items-center">
      <h1 className="text-2xl font-bold mb-2">Shop Rail Highlight Variations</h1>
      <p className="text-zinc-400 mb-8">Press 'V' to exit back to the game.</p>
      
      <div className="flex flex-wrap gap-6 justify-center max-w-6xl">
        {renderRail(1, "1. Enhanced Original", "Slightly stronger cyan glow, better scaling.")}
        {renderRail(2, "2. Brutalist Offset", "Sharp white/black inversion with hard offset cyan shadow.")}
        {renderRail(3, "3. Maximalist Neon", "Aggressive fuchsia ring, deep glow, and pulse animation.")}
        {renderRail(4, "4. Luxury Gold", "Refined amber gradient, elegant shadow and scale.")}
        {renderRail(5, "5. Cyberpunk", "Harsh angles, magenta/cyan mix, slight skew.")}
      </div>
    </div>
  );
};
