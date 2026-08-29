import React, { useEffect, useId, useState } from 'react';
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Gamepad2,
  Keyboard as KeyboardIcon,
  RotateCcw,
  RotateCw,
  Shield,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Swords,
  X,
  Zap,
} from 'lucide-react';
import { SHOP_CATALOG } from '../shop/shopCatalog';
import { formatKeyCode, formatMovePair, type KeyBindings } from '../input/keyBindings';
import type { ShopItem } from '../types';

export interface HowToPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
  bindings: KeyBindings;
  accentColor?: string;
}

type TabType = 'overview' | 'items' | 'mechanics';
type ItemFilter = 'all' | 'opponent' | 'self';
type InputMode = 'touch' | 'keyboard' | 'gamepad';

function detectInitialInputMode(): InputMode {
  if (typeof window === 'undefined') return 'keyboard';
  const isCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches;
  const isFinePointer = window.matchMedia?.('(pointer: fine)').matches;
  return isCoarsePointer && !isFinePointer ? 'touch' : 'keyboard';
}

export const HowToPlayModal: React.FC<HowToPlayModalProps> = ({
  isOpen,
  onClose,
  bindings,
  accentColor = '#22c55e',
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [itemFilter, setItemFilter] = useState<ItemFilter>('all');
  const [inputMode, setInputMode] = useState<InputMode>(detectInitialInputMode);
  const titleId = useId();

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const opponentCount = SHOP_CATALOG.filter((i) => i.target === 'opponent').length;
  const selfCount = SHOP_CATALOG.filter((i) => i.target === 'self').length;

  const filteredItems = SHOP_CATALOG.filter((item) => {
    if (itemFilter === 'all') return true;
    return item.target === itemFilter;
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2.5 backdrop-blur-sm sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex max-h-[min(92dvh,48rem)] w-full max-w-2xl flex-col rounded-2xl border border-white/15 bg-[#10121a] shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 shrink-0 text-zinc-400 sm:h-5 sm:w-5" />
            <h2 id={titleId} className="text-xs font-bold uppercase tracking-wider text-white sm:text-sm">
              How To Play &amp; Items
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-white/[0.08] bg-white/[0.02] px-3 py-2 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wide transition-colors sm:px-3 sm:text-[11px] ${
              activeTab === 'overview'
                ? 'bg-white/15 text-white shadow-inner'
                : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
            }`}
          >
            <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
            <span className="sm:hidden">Rules</span>
            <span className="hidden sm:inline">Rules &amp; Controls</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('items')}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wide transition-colors sm:px-3 sm:text-[11px] ${
              activeTab === 'items'
                ? 'bg-white/15 text-white shadow-inner'
                : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
            }`}
          >
            <Zap className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
            <span className="sm:hidden">Items ({SHOP_CATALOG.length})</span>
            <span className="hidden sm:inline">Item Catalog ({SHOP_CATALOG.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('mechanics')}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wide transition-colors sm:px-3 sm:text-[11px] ${
              activeTab === 'mechanics'
                ? 'bg-white/15 text-white shadow-inner'
                : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
            }`}
          >
            <Swords className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
            <span className="sm:hidden">Tactics</span>
            <span className="hidden sm:inline">Tactics &amp; Synergies</span>
          </button>
        </div>

        {/* Modal Scrollable Content with touch-friendly visible scrollbar */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3.5 py-3.5 sm:px-6 sm:py-5 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.25)_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-white/[0.02] [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/30">
          {activeTab === 'overview' && (
            <div className="space-y-3 text-[9px] text-zinc-300 sm:text-[11px]">
              {/* Controls Box with Input Mode Switcher */}
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 sm:p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-white/5 pb-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white sm:text-xs">
                    Controls &amp; Input
                  </p>

                  {/* Input Method Toggle */}
                  <div className="flex items-center gap-1 overflow-x-auto rounded-lg bg-black/40 p-0.5 border border-white/5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <button
                      type="button"
                      onClick={() => setInputMode('touch')}
                      className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[8px] font-bold uppercase tracking-wider transition-colors sm:text-[9px] ${
                        inputMode === 'touch'
                          ? 'bg-white/20 text-white'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <Smartphone className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      <span>Touch</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setInputMode('keyboard')}
                      className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[8px] font-bold uppercase tracking-wider transition-colors sm:text-[9px] ${
                        inputMode === 'keyboard'
                          ? 'bg-white/20 text-white'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <KeyboardIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      <span>Keyboard</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setInputMode('gamepad')}
                      className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[8px] font-bold uppercase tracking-wider transition-colors sm:text-[9px] ${
                        inputMode === 'gamepad'
                          ? 'bg-white/20 text-white'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <Gamepad2 className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      <span>Gamepad</span>
                    </button>
                  </div>
                </div>

                {/* Input Method Content */}
                {inputMode === 'touch' && (
                  <div className="mt-3 space-y-2.5">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {/* Left Thumb */}
                      <div className="rounded-lg bg-black/30 p-2.5 border border-white/5">
                        <div className="flex items-center gap-1.5 text-zinc-300 font-bold">
                          <span className="flex h-5 w-5 items-center justify-center rounded bg-white/10 text-[9px]">👈</span>
                          <span className="text-[9px] sm:text-[10px] text-white">Left Thumb: D-Pad</span>
                        </div>
                        <p className="mt-1.5 text-[8px] leading-relaxed text-zinc-400 sm:text-[9px]">
                          Tap or hold <strong className="text-zinc-200">Left</strong> / <strong className="text-zinc-200">Right</strong> to shift pieces. Tap or hold <strong className="text-zinc-200">Down</strong> to Soft Drop.
                        </p>
                      </div>

                      {/* Right Thumb */}
                      <div className="rounded-lg bg-black/30 p-2.5 border border-white/5">
                        <div className="flex items-center gap-1.5 text-zinc-300 font-bold">
                          <span className="flex h-5 w-5 items-center justify-center rounded bg-white/10 text-[9px]">👉</span>
                          <span className="text-[9px] sm:text-[10px] text-white">Right Thumb: Actions</span>
                        </div>
                        <p className="mt-1.5 text-[8px] leading-relaxed text-zinc-400 sm:text-[9px]">
                          Tap <strong className="text-zinc-200">▲</strong> for Hard Drop. Tap <strong className="text-zinc-200">↺</strong> (CCW) or <strong className="text-zinc-200">↻</strong> (CW) to rotate your active piece.
                        </p>
                      </div>
                    </div>

                    {/* Utility Touch Bar */}
                    <div className="rounded-lg bg-black/30 p-2.5 border border-white/5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Archive className="h-3.5 w-3.5 text-zinc-400" />
                          <span className="text-[8px] uppercase font-bold text-zinc-200 sm:text-[9px]">Storage (Hold)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <ShoppingBag className="h-3.5 w-3.5 text-zinc-400" />
                          <span className="text-[8px] uppercase font-bold text-zinc-200 sm:text-[9px]">Shop Rail (Buy)</span>
                        </div>
                      </div>
                      <p className="mt-1.5 text-[8px] leading-relaxed text-zinc-400 sm:text-[9px]">
                        Dedicated on-screen buttons allow swapping into Storage or cycling and purchasing Shop powers on the fly.
                      </p>
                    </div>
                  </div>
                )}

                {inputMode === 'keyboard' && (
                  <div className="mt-3">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <div className="rounded-lg bg-black/30 p-2 border border-white/5">
                        <span className="text-zinc-400 block text-[8px] uppercase tracking-wide">Movement</span>
                        <span className="mt-1 block font-mono text-[9px] font-bold text-white sm:text-[11px]">{formatMovePair(bindings)}</span>
                      </div>
                      <div className="rounded-lg bg-black/30 p-2 border border-white/5">
                        <span className="text-zinc-400 block text-[8px] uppercase tracking-wide">Soft / Hard</span>
                        <span className="mt-1 block font-mono text-[9px] font-bold text-white sm:text-[11px]">
                          {formatKeyCode(bindings.softDrop)} / {formatKeyCode(bindings.hardDrop)}
                        </span>
                      </div>
                      <div className="rounded-lg bg-black/30 p-2 border border-white/5">
                        <span className="text-zinc-400 block text-[8px] uppercase tracking-wide">Rotate CCW/CW</span>
                        <span className="mt-1 block font-mono text-[9px] font-bold text-white sm:text-[11px]">
                          {formatKeyCode(bindings.rotateCCW)} / {formatKeyCode(bindings.rotateCW)}
                        </span>
                      </div>
                      <div className="rounded-lg bg-black/30 p-2 border border-white/5">
                        <span className="text-zinc-400 block text-[8px] uppercase tracking-wide">Storage / Hold</span>
                        <span className="mt-1 block font-mono text-[9px] font-bold text-white sm:text-[11px]">{formatKeyCode(bindings.hold)}</span>
                      </div>
                      <div className="col-span-2 rounded-lg bg-black/30 p-2 border border-white/5 sm:col-span-2">
                        <span className="text-zinc-400 block text-[8px] uppercase tracking-wide">Shop Rail (Cycle / Buy)</span>
                        <span className="mt-1 block font-mono text-[9px] font-bold text-white sm:text-[11px]">
                          {formatKeyCode(bindings.shop)} <span className="text-zinc-400 text-[8px] font-normal">(Cycle highlight / Buy)</span>
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {inputMode === 'gamepad' && (
                  <div className="mt-3 rounded-lg bg-black/30 p-3 border border-white/5 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Gamepad2 className="h-4 w-4 text-amber-400" />
                      <span className="text-[9px] font-bold uppercase tracking-wider text-amber-300 sm:text-[10px]">
                        Controller Support Coming Soon
                      </span>
                    </div>
                    <p className="mt-2 text-[8px] leading-relaxed text-zinc-400 sm:text-[9px]">
                      Native gamepad mapping (Xbox, PlayStation, and Switch controllers) is currently in development.
                      Planned mappings: D-Pad / Left Stick for movement, Face Buttons for drop and rotations, Bumpers for Hold &amp; Shop.
                    </p>
                  </div>
                )}
              </div>

              {/* Match Loop Box */}
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 sm:p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white sm:text-xs">
                  Line Clears &amp; The Shop Rail
                </p>
                <p className="mt-1.5 leading-relaxed text-zinc-400">
                  Every line you clear awards cash into your wallet and rolls offers in your active shop rail.
                  Purchase offensive abilities to sabotage your opponent or defensive utilities to protect your stack.
                </p>
              </div>

              {/* Poison & Board Attacks */}
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 sm:p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white sm:text-xs">
                  Poison &amp; Board Attacks
                </p>
                <p className="mt-1.5 leading-relaxed text-zinc-400">
                  Poison infects blocks on lock and spreads in organic waves across adjacent cells. Combine attacks like
                  <strong className="text-zinc-200"> Elixir</strong> with <strong className="text-zinc-200">Wild Purge</strong> or
                  <strong className="text-zinc-200"> Wildcard +4</strong> to carve holes or clone infected pieces into their stack.
                </p>
              </div>

              {/* Win Condition */}
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 sm:p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white sm:text-xs">
                  Victory
                </p>
                <p className="mt-1.5 leading-relaxed text-zinc-400">
                  Both players duel simultaneously on parallel 10×18 boards. The first player to top out above the visible board loses immediately.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'items' && (
            <div className="space-y-3">
              {/* Category Filter Pills (Scrollable on small viewports) */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button
                  type="button"
                  onClick={() => setItemFilter('all')}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[8px] font-bold uppercase tracking-wide transition-colors sm:text-[9px] ${
                    itemFilter === 'all'
                      ? 'bg-white/20 text-white'
                      : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
                  }`}
                >
                  All ({SHOP_CATALOG.length})
                </button>
                <button
                  type="button"
                  onClick={() => setItemFilter('opponent')}
                  className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[8px] font-bold uppercase tracking-wide transition-colors sm:text-[9px] ${
                    itemFilter === 'opponent'
                      ? 'bg-rose-500/25 text-rose-300 border border-rose-500/40'
                      : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
                  }`}
                >
                  <Swords className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                  <span className="sm:hidden">Attacks ({opponentCount})</span>
                  <span className="hidden sm:inline">Opponent Sabotage ({opponentCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setItemFilter('self')}
                  className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[8px] font-bold uppercase tracking-wide transition-colors sm:text-[9px] ${
                    itemFilter === 'self'
                      ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
                      : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200'
                  }`}
                >
                  <Shield className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                  <span className="sm:hidden">Utility ({selfCount})</span>
                  <span className="hidden sm:inline">Self Utility ({selfCount})</span>
                </button>
              </div>

              {/* Items Grid */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {filteredItems.map((item: ShopItem) => {
                  const isOpponent = item.target === 'opponent';
                  return (
                    <div
                      key={item.id}
                      className="group flex flex-col justify-between rounded-xl border border-white/[0.08] bg-white/[0.02] p-2.5 sm:p-3 transition-colors hover:border-white/20 hover:bg-white/[0.04]"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-black/40 text-sm shadow-inner sm:text-base">
                              {item.icon}
                            </span>
                            <div>
                              <p className="text-[10px] font-bold text-white leading-tight sm:text-xs">{item.name}</p>
                              <span className="text-[8px] font-medium text-zinc-400 sm:text-[9px]">
                                T{item.tier} • {item.cost}🪙
                              </span>
                            </div>
                          </div>
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${
                              isOpponent
                                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/20'
                                : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                            }`}
                          >
                            {isOpponent ? 'Opponent' : 'Self'}
                          </span>
                        </div>
                        <p className="mt-2 text-[8px] leading-relaxed text-zinc-400 sm:text-[9px]">
                          {item.description}
                        </p>
                      </div>

                      {item.synergyTargetId && (
                        <div className="mt-2 flex items-center gap-1 border-t border-white/5 pt-1.5 text-[8px] text-amber-300/80 font-medium sm:text-[9px]">
                          <Sparkles className="h-2.5 w-2.5 shrink-0" />
                          <span>Pairs with {SHOP_CATALOG.find((s) => s.id === item.synergyTargetId)?.name ?? item.synergyTargetId}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'mechanics' && (
            <div className="space-y-3 text-[9px] text-zinc-300 sm:text-[11px]">
              {/* Dynamic Pricing */}
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 sm:p-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm sm:text-base">💸</span>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white sm:text-xs">
                    Dynamic Shop Pricing
                  </p>
                </div>
                <p className="mt-1.5 leading-relaxed text-zinc-400">
                  Each powerup has an independent price curve. Repeated buys escalate cost.
                  Purchasing <strong className="text-zinc-200">Tax Evasion</strong> lowers all price curves by 2 levels.
                </p>
              </div>

              {/* Synergies */}
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 sm:p-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm sm:text-base">🎭</span>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white sm:text-xs">
                    Re-Trim + Curtain Vision Denial
                  </p>
                </div>
                <p className="mt-1.5 leading-relaxed text-zinc-400">
                  <strong className="text-zinc-200">Re-Trim</strong> raises your opponent's swap line higher.
                  Following up with <strong className="text-zinc-200">Curtain</strong> obscures everything below that line in blinding frost.
                </p>
              </div>

              {/* Poison Combos */}
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 sm:p-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm sm:text-base">🧪</span>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white sm:text-xs">
                    Poison Vectors &amp; Purge Combos
                  </p>
                </div>
                <p className="mt-1.5 leading-relaxed text-zinc-400">
                  <strong className="text-zinc-200">Elixir</strong> infects falling pieces; <strong className="text-zinc-200">Contagion</strong> infects storage.
                  Once poisoned blocks spread, <strong className="text-zinc-200">Wild Purge</strong> vaporizes an entire color into empty holes, or <strong className="text-zinc-200">Wildcard +4</strong> clones their cluster as a piece for them to place.
                </p>
              </div>

              {/* Self Defense */}
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 sm:p-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm sm:text-base">🛰️</span>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white sm:text-xs">
                    Garbage Defense &amp; Stack Clears
                  </p>
                </div>
                <p className="mt-1.5 leading-relaxed text-zinc-400">
                  <strong className="text-zinc-200">Satellite</strong> delays incoming opponent garbage by 10s.
                  <strong className="text-zinc-200"> Bomber</strong> and <strong className="text-zinc-200">Tectonic Shift</strong> clear messy holes to prevent top-outs.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-white/10 bg-black/30 px-3.5 py-2.5 sm:px-6 sm:py-3.5">
          <p className="text-[8px] text-zinc-500 hidden sm:block sm:text-[9px]">
            {activeTab === 'items'
              ? `Showing ${filteredItems.length} of ${SHOP_CATALOG.length} items`
              : 'Press Esc or tap outside to close'}
          </p>
          <button
            type="button"
            onClick={onClose}
            style={{ backgroundColor: accentColor }}
            className="ml-auto rounded-xl px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#07110d] transition-opacity hover:opacity-90 active:scale-95 sm:px-5 sm:py-2 sm:text-xs"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};
