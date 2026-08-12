import React, { useCallback, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock3, Coins, RotateCcw, ShoppingCart, X } from 'lucide-react';
import { SHOP_ITEM_BY_ID } from '../shop/shopCatalog';
import { ShopItem } from '../types';

type MockVariant = 'compact' | 'deck' | 'ladder';
type MockScenario = 'fresh' | 'active' | 'allowance' | 'expired' | 'unaffordable';

interface MockPricingPolicy {
  basePrice: number;
  growthRate: number;
  allowance: number;
  demoLevel: number;
}

interface MockPricingState {
  level: number;
  price: number;
  nextPrice: number;
  allowance: number;
  purchasesInWindow: number;
  purchasesRemaining: number;
  secondsRemaining: number | null;
  active: boolean;
  expired: boolean;
  gated: boolean;
  windowClosedBy: 'allowance' | 'timer' | null;
}

interface MockOverride {
  level: number;
  purchasesInWindow: number;
  secondsRemaining: number | null;
  windowClosedBy?: 'allowance' | 'timer' | null;
}

const MOCK_ITEM_IDS = [
  'fortify-frame',
  'nova-charge',
  'curtain',
  'quickstep-clock',
  'satellite-link',
] as const;

const MOCK_POLICIES: Record<string, MockPricingPolicy> = {
  'fortify-frame': { basePrice: 60, growthRate: 1.95, allowance: 2, demoLevel: 1 },
  'nova-charge': { basePrice: 110, growthRate: 1.65, allowance: 4, demoLevel: 2 },
  curtain: { basePrice: 140, growthRate: 1.85, allowance: 3, demoLevel: 3 },
  'quickstep-clock': { basePrice: 50, growthRate: 1.8, allowance: 5, demoLevel: 4 },
  'satellite-link': { basePrice: 80, growthRate: 2.05, allowance: 2, demoLevel: 2 },
};

const MOCK_WALLET = 1250;

const VARIANTS: Array<{ id: MockVariant; label: string; shortLabel: string }> = [
  { id: 'compact', label: 'Compact rail', shortLabel: 'A' },
  { id: 'deck', label: 'Command deck', shortLabel: 'B' },
  { id: 'ladder', label: 'Price ladder', shortLabel: 'C' },
];

const SCENARIOS: Array<{ id: MockScenario; label: string; description: string }> = [
  { id: 'fresh', label: 'Fresh item', description: 'No engagement window yet' },
  { id: 'active', label: 'Active window', description: 'Multiple buys at the current price' },
  { id: 'allowance', label: 'One buy left', description: 'Allowance is nearly exhausted' },
  { id: 'expired', label: 'Window expired', description: 'Next purchase advances one level' },
  { id: 'unaffordable', label: 'Unaffordable', description: 'Wallet cannot cover the current tier' },
];

function roundPrice(value: number): number {
  return Math.max(5, Math.round(value / 5) * 5);
}

function priceAtLevel(policy: MockPricingPolicy, level: number): number {
  if (level === 0) return policy.basePrice;
  return roundPrice(policy.basePrice * policy.growthRate ** level);
}

function formatCredits(value: number): string {
  return value.toLocaleString('en-US');
}

function formatTimer(seconds: number | null): string {
  if (seconds === null) return '—';
  return `00:${String(Math.max(0, seconds)).padStart(2, '0')}`;
}

function getItem(id: string): ShopItem {
  const item = SHOP_ITEM_BY_ID.get(id);
  if (!item) throw new Error(`Missing mock shop item: ${id}`);
  return item;
}

function variantFromUrl(): MockVariant {
  if (typeof window === 'undefined') return 'compact';
  const requested = new URLSearchParams(window.location.search).get('shopVariant');
  return VARIANTS.some((variant) => variant.id === requested)
    ? requested as MockVariant
    : 'compact';
}

function writeVariantToUrl(variant: MockVariant): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set('shopMock', '1');
  url.searchParams.set('shopVariant', variant);
  window.history.replaceState({}, '', url);
}

function getScenarioState(
  itemId: string,
  scenario: MockScenario,
  override: MockOverride | undefined,
): MockPricingState {
  const policy = MOCK_POLICIES[itemId];
  const baseLevel = scenario === 'fresh'
    ? 0
    : scenario === 'unaffordable'
      ? 4
      : scenario === 'expired'
        ? policy.demoLevel + 1
        : policy.demoLevel;
  const defaultPurchases = scenario === 'fresh'
    ? 0
    : scenario === 'allowance'
      ? Math.max(0, policy.allowance - 1)
      : scenario === 'active' || scenario === 'unaffordable'
        ? 1
        : 0;
  const defaultSeconds = scenario === 'active'
    ? 13
    : scenario === 'allowance'
      ? 5
      : scenario === 'unaffordable'
        ? 8
        : null;
  const level = override?.level ?? baseLevel;
  const purchasesInWindow = override?.purchasesInWindow ?? defaultPurchases;
  const secondsRemaining = override ? override.secondsRemaining : defaultSeconds;
  const price = priceAtLevel(policy, level);
  // Satellite's live gate is "garbage must be incoming". Keep that prerequisite
  // visible in the prototype without pretending the mockup has a live board.
  const gated = itemId === 'satellite-link';
  const windowClosedBy = override
    ? override.windowClosedBy ?? null
    : scenario === 'expired'
      ? 'timer'
      : null;

  return {
    level,
    price,
    nextPrice: priceAtLevel(policy, level + 1),
    allowance: policy.allowance,
    purchasesInWindow,
    purchasesRemaining: Math.max(0, policy.allowance - purchasesInWindow),
    secondsRemaining,
    active: secondsRemaining !== null && windowClosedBy === null,
    expired: windowClosedBy !== null,
    gated,
    windowClosedBy,
  };
}

function stateTone(state: MockPricingState, affordable: boolean): string {
  if (state.gated) return 'border-violet-400/70 bg-violet-950/40 text-violet-100';
  if (!affordable) return 'border-rose-400/70 bg-rose-950/40 text-rose-100';
  if (state.windowClosedBy === 'allowance') return 'border-amber-400/70 bg-amber-950/35 text-amber-100';
  if (state.windowClosedBy === 'timer') return 'border-orange-400/70 bg-orange-950/35 text-orange-100';
  if (state.active) return 'border-cyan-300/60 bg-cyan-950/35 text-cyan-50';
  return 'border-zinc-700 bg-zinc-950/40 text-zinc-100';
}

interface PricingMetaProps {
  state: MockPricingState;
  compact?: boolean;
}

const PricingMeta: React.FC<PricingMetaProps> = ({ state, compact = false }) => (
  <div className={`flex ${compact ? 'flex-wrap' : 'flex-col'} gap-1.5 font-mono text-[9px] uppercase tracking-wider text-zinc-400`}>
    <span className="text-cyan-200">L{state.level}</span>
    <span>{state.purchasesRemaining}/{state.allowance} buys left</span>
    <span className={state.active ? 'text-cyan-200' : state.expired ? 'text-amber-200' : 'text-zinc-500'}>
      {state.active
        ? `${formatTimer(state.secondsRemaining)} remaining`
        : state.windowClosedBy === 'allowance'
          ? 'Allowance exhausted'
          : state.windowClosedBy === 'timer'
            ? 'Timer expired'
            : 'Window inactive'}
    </span>
  </div>
);

interface MockItemRowProps {
  item: ShopItem;
  state: MockPricingState;
  selected: boolean;
  affordable: boolean;
  onSelect: () => void;
  expanded?: boolean;
}

const MockItemRow: React.FC<MockItemRowProps> = ({
  item,
  state,
  selected,
  affordable,
  onSelect,
  expanded = false,
}) => (
  <button
    type="button"
    onClick={onSelect}
    className={`w-full text-left transition-all ${selected ? 'scale-[1.02]' : 'opacity-85 hover:opacity-100'}`}
    aria-pressed={selected}
  >
    <div className={`rounded-md border px-2 py-2 ${stateTone(state, affordable)} ${selected ? 'shadow-[0_0_16px_rgba(34,211,238,0.2)]' : ''}`}>
      <div className="flex items-center gap-2">
        <span className="text-lg leading-none">{item.icon}</span>
        <span className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase tracking-wide">{item.name}</span>
        <span className="font-mono text-[11px] font-bold">{formatCredits(state.price)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[8px] uppercase tracking-wider text-zinc-400">
        <span>Level {state.level}</span>
        <span>{state.gated ? 'Gated · needs garbage' : affordable ? 'Affordable' : 'Need more score'}</span>
      </div>
      {expanded && (
        <div className="mt-2 border-t border-white/10 pt-2">
          <PricingMeta state={state} compact />
          <div className="mt-1 text-[8px] uppercase tracking-wider text-zinc-500">
            Next price <span className="font-mono text-zinc-200">{formatCredits(state.nextPrice)}</span>
          </div>
        </div>
      )}
    </div>
  </button>
);

interface MockShopProps {
  items: ShopItem[];
  selectedId: string;
  scenario: MockScenario;
  overrides: Record<string, MockOverride>;
  onSelect: (id: string) => void;
  onPurchase: () => void;
  onAdvanceTime: () => void;
}

const VariantCompact: React.FC<MockShopProps> = ({
  items,
  selectedId,
  scenario,
  overrides,
  onSelect,
  onPurchase,
  onAdvanceTime,
}) => (
  <div className="mx-auto flex w-full max-w-[24rem] flex-col gap-3 rounded-2xl border border-cyan-400/20 bg-[#0b141b]/95 p-3 shadow-2xl">
    <div className="flex items-center justify-between border-b border-white/10 pb-2">
      <div>
        <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-cyan-300">Compact rail</p>
        <p className="mt-1 text-[10px] text-zinc-500">Board-adjacent shop state</p>
      </div>
      <WalletBadge />
    </div>
    <div className="space-y-1.5">
      {items.map((item) => {
        const state = getScenarioState(item.id, scenario, overrides[item.id]);
        return (
          <MockItemRow
            key={item.id}
            item={item}
            state={state}
            selected={item.id === selectedId}
            affordable={state.price <= MOCK_WALLET}
            expanded={item.id === selectedId}
            onSelect={() => onSelect(item.id)}
          />
        );
      })}
    </div>
    <MockActionBar
      state={getScenarioState(selectedId, scenario, overrides[selectedId])}
      onPurchase={onPurchase}
      onAdvanceTime={onAdvanceTime}
    />
  </div>
);

const VariantDeck: React.FC<MockShopProps> = ({
  items,
  selectedId,
  scenario,
  overrides,
  onSelect,
  onPurchase,
  onAdvanceTime,
}) => {
  const selectedItem = getItem(selectedId);
  const selectedState = getScenarioState(selectedId, scenario, overrides[selectedId]);
  const affordable = selectedState.price <= MOCK_WALLET;
  const allowanceSlots = Array.from(
    { length: selectedState.allowance },
    (_, slot) => `${selectedId}-allowance-${slot}`,
  );

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-px overflow-hidden rounded-2xl border border-cyan-400/20 bg-cyan-300/10 shadow-2xl md:grid-cols-[minmax(12rem,0.8fr)_minmax(18rem,1.4fr)]">
      <div className="bg-[#0b141b]/95 p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-cyan-300">Command deck</p>
            <p className="mt-1 text-[10px] text-zinc-500">Choose an offer, then inspect its economy</p>
          </div>
          <WalletBadge />
        </div>
        <div className="space-y-2">
          {items.map((item) => {
            const state = getScenarioState(item.id, scenario, overrides[item.id]);
            return (
              <MockItemRow
                key={item.id}
                item={item}
                state={state}
                selected={item.id === selectedId}
                affordable={state.price <= MOCK_WALLET}
                onSelect={() => onSelect(item.id)}
              />
            );
          })}
        </div>
      </div>
      <div className="flex flex-col justify-between bg-[#101d26]/95 p-5">
        <div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-zinc-500">Selected offer</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-white">{selectedItem.icon} {selectedItem.name}</h2>
              <p className="mt-2 max-w-md text-xs leading-relaxed text-zinc-400">{selectedItem.description}</p>
            </div>
            <div className={`rounded-xl border px-3 py-2 text-right ${stateTone(selectedState, affordable)}`}>
              <p className="text-[8px] uppercase tracking-[0.18em] opacity-70">Current price</p>
              <p className="mt-1 font-mono text-2xl font-black">{formatCredits(selectedState.price)}</p>
            </div>
          </div>
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <InfoTile label="Price level" value={`L${selectedState.level}`} />
            <InfoTile label="Next price" value={formatCredits(selectedState.nextPrice)} />
            <InfoTile label="Same-price buys" value={`${selectedState.purchasesRemaining}/${selectedState.allowance} remaining`} />
            <InfoTile label="Engagement window" value={selectedState.active ? formatTimer(selectedState.secondsRemaining) : selectedState.windowClosedBy === 'allowance' ? 'Allowance exhausted' : selectedState.windowClosedBy === 'timer' ? 'Timer expired' : 'Not started'} />
          </div>
          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="mb-2 flex items-center justify-between text-[9px] uppercase tracking-wider text-zinc-500">
              <span>Window progress</span>
              <span className="font-mono text-cyan-200">{selectedState.purchasesInWindow}/{selectedState.allowance} buys</span>
            </div>
            <div className="flex gap-1">
              {allowanceSlots.map((slotId, index) => (
                <span key={slotId} className={`h-2 flex-1 rounded-sm ${index < selectedState.purchasesInWindow ? 'bg-cyan-300' : 'bg-zinc-800'}`} />
              ))}
            </div>
          </div>
        </div>
        <MockActionBar state={selectedState} onPurchase={onPurchase} onAdvanceTime={onAdvanceTime} wide />
      </div>
    </div>
  );
};

const VariantLadder: React.FC<MockShopProps> = ({
  items,
  selectedId,
  scenario,
  overrides,
  onSelect,
  onPurchase,
  onAdvanceTime,
}) => {
  const selectedItem = getItem(selectedId);
  const selectedState = getScenarioState(selectedId, scenario, overrides[selectedId]);
  const policy = MOCK_POLICIES[selectedId];
  const affordable = selectedState.price <= MOCK_WALLET;
  const ladder = Array.from({ length: 6 }, (_, level) => ({ level, price: priceAtLevel(policy, level) }));

  return (
    <div className="mx-auto w-full max-w-5xl rounded-2xl border border-cyan-400/20 bg-[#0b141b]/95 p-4 shadow-2xl sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-cyan-300">Price ladder</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white">The shop remembers pressure.</h2>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-zinc-400">Every item has its own uncapped curve. A short engagement window lets you buy several times before the next tier takes over.</p>
        </div>
        <WalletBadge />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(15rem,0.7fr)_minmax(22rem,1.8fr)]">
        <div className="space-y-2">
          {items.map((item) => {
            const state = getScenarioState(item.id, scenario, overrides[item.id]);
            return (
              <MockItemRow
                key={item.id}
                item={item}
                state={state}
                selected={item.id === selectedId}
                affordable={state.price <= MOCK_WALLET}
                onSelect={() => onSelect(item.id)}
              />
            );
          })}
        </div>
        <div className={`rounded-2xl border p-4 sm:p-5 ${stateTone(selectedState, affordable)}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[9px] uppercase tracking-[0.2em] opacity-60">Selected curve</p>
              <h3 className="mt-2 text-xl font-black">{selectedItem.icon} {selectedItem.name}</h3>
            </div>
            <div className="text-right">
              <p className="text-[8px] uppercase tracking-wider opacity-60">Now</p>
              <p className="font-mono text-2xl font-black">{formatCredits(selectedState.price)}</p>
            </div>
          </div>
          <div className="mt-5 overflow-x-auto pb-2">
            <div className="flex min-w-max items-center gap-2">
              {ladder.map((entry, index) => (
                <React.Fragment key={entry.level}>
                  <div className={`min-w-[4.6rem] rounded-xl border px-2 py-2 text-center ${entry.level === selectedState.level ? 'border-white bg-white/15 shadow-[0_0_18px_rgba(255,255,255,0.18)]' : 'border-white/10 bg-black/15 opacity-70'}`}>
                    <p className="text-[8px] uppercase tracking-wider opacity-60">L{entry.level}</p>
                    <p className="mt-1 font-mono text-sm font-bold">{formatCredits(entry.price)}</p>
                  </div>
                  {index < ladder.length - 1 && <span className="text-zinc-500">→</span>}
                </React.Fragment>
              ))}
              <span className="px-1 text-lg text-zinc-500">…</span>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <InfoTile label="Level" value={`L${selectedState.level}`} />
            <InfoTile label="Buys remaining" value={`${selectedState.purchasesRemaining}/${selectedState.allowance}`} />
            <InfoTile label="Timer" value={selectedState.active ? formatTimer(selectedState.secondsRemaining) : selectedState.windowClosedBy === 'allowance' ? 'Allowance exhausted' : selectedState.windowClosedBy === 'timer' ? 'Timer expired' : 'Not started'} />
          </div>
          <MockActionBar state={selectedState} onPurchase={onPurchase} onAdvanceTime={onAdvanceTime} wide />
        </div>
      </div>
    </div>
  );
};

const WalletBadge: React.FC = () => (
  <div className="flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-950/30 px-2.5 py-1 font-mono text-[10px] text-amber-100">
    <Coins size={12} className="text-amber-300" />
    {formatCredits(MOCK_WALLET)}
  </div>
);

const InfoTile: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg border border-white/10 bg-black/15 px-3 py-2">
    <p className="text-[8px] uppercase tracking-wider text-zinc-500">{label}</p>
    <p className="mt-1 font-mono text-xs font-bold text-zinc-100">{value}</p>
  </div>
);

const MockActionBar: React.FC<{
  state: MockPricingState;
  onPurchase: () => void;
  onAdvanceTime: () => void;
  wide?: boolean;
}> = ({ state, onPurchase, onAdvanceTime, wide = false }) => {
  const affordable = state.price <= MOCK_WALLET;
  const canPurchase = !state.gated && affordable && state.purchasesRemaining > 0;
  return (
    <div className={`mt-3 flex ${wide ? 'flex-wrap' : ''} items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/25 p-2.5`}>
      <div className="flex items-center gap-2 text-[9px] uppercase tracking-wider text-zinc-400">
        <Clock3 size={13} className={state.active ? 'text-cyan-300' : 'text-zinc-500'} />
        <span>{state.active ? `${formatTimer(state.secondsRemaining)} left` : state.windowClosedBy === 'allowance' ? 'Allowance exhausted' : state.windowClosedBy === 'timer' ? 'Timer expired' : 'Window not started'}</span>
      </div>
      <div className="flex gap-1.5">
        <button type="button" onClick={onAdvanceTime} className="rounded-lg border border-zinc-600 bg-zinc-900 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-wider text-zinc-300 hover:border-zinc-400">
          +5 sec
        </button>
        <button type="button" onClick={onPurchase} disabled={!canPurchase} className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-wider transition ${canPurchase ? 'border-cyan-300/60 bg-cyan-400/20 text-cyan-100 hover:bg-cyan-400/30' : 'cursor-not-allowed border-zinc-700 bg-zinc-900 text-zinc-600'}`}>
          <ShoppingCart size={12} />
          {state.gated ? 'Waiting for garbage' : affordable ? 'Simulate buy' : 'Need more score'}
        </button>
      </div>
    </div>
  );
};

export const ShopRailVariations: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [variant, setVariant] = useState<MockVariant>(variantFromUrl);
  const [selectedId, setSelectedId] = useState(MOCK_ITEM_IDS[0]);
  const [scenario, setScenario] = useState<MockScenario>('active');
  const [overrides, setOverrides] = useState<Record<string, MockOverride>>({});

  const items = useMemo(() => MOCK_ITEM_IDS.map(getItem), []);
  const selectedState = getScenarioState(selectedId, scenario, overrides[selectedId]);

  const selectVariant = useCallback((next: MockVariant) => {
    setVariant(next);
    writeVariantToUrl(next);
  }, []);

  const changeScenario = useCallback((next: MockScenario) => {
    setScenario(next);
    setOverrides({});
  }, []);

  const simulatePurchase = useCallback(() => {
    const policy = MOCK_POLICIES[selectedId];
    if (selectedState.gated || selectedState.price > MOCK_WALLET || selectedState.purchasesRemaining <= 0) return;
    const nextPurchases = selectedState.purchasesInWindow + 1;
    setOverrides((current) => ({
      ...current,
      [selectedId]: nextPurchases >= policy.allowance
        ? { level: selectedState.level + 1, purchasesInWindow: 0, secondsRemaining: null, windowClosedBy: 'allowance' }
        : { level: selectedState.level, purchasesInWindow: nextPurchases, secondsRemaining: selectedState.secondsRemaining ?? 13 },
    }));
  }, [selectedId, selectedState]);

  const advanceTime = useCallback(() => {
    if (selectedState.secondsRemaining === null) return;
    const nextSeconds = selectedState.secondsRemaining - 5;
    setOverrides((current) => ({
      ...current,
      [selectedId]: nextSeconds <= 0
        ? { level: selectedState.level + 1, purchasesInWindow: 0, secondsRemaining: null, windowClosedBy: 'timer' }
        : { level: selectedState.level, purchasesInWindow: selectedState.purchasesInWindow, secondsRemaining: nextSeconds },
    }));
  }, [selectedId, selectedState]);

  const resetMock = useCallback(() => {
    setScenario('active');
    setSelectedId(MOCK_ITEM_IDS[0]);
    setOverrides({});
  }, []);

  const activeVariantIndex = VARIANTS.findIndex((entry) => entry.id === variant);
  const moveVariant = (direction: -1 | 1) => {
    const nextIndex = (activeVariantIndex + direction + VARIANTS.length) % VARIANTS.length;
    selectVariant(VARIANTS[nextIndex].id);
  };

  const sharedProps: MockShopProps = {
    items,
    selectedId,
    scenario,
    overrides,
    onSelect: setSelectedId,
    onPurchase: simulatePurchase,
    onAdvanceTime: advanceTime,
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#05090d] p-3 text-white sm:p-6">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.24em] text-cyan-300">
              <span className="rounded border border-cyan-300/40 px-1.5 py-0.5">Prototype</span>
              Shop pricing UX lab
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-4xl">Make the next price legible.</h1>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-zinc-400 sm:text-sm">Read-only mockup for the uncapped item-engagement pricing system. No purchases or socket events are sent from this page.</p>
          </div>
          <button type="button" onClick={onClose} className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-zinc-300 hover:border-zinc-400">
            <X size={14} /> Exit mockup <span className="text-zinc-500">[V]</span>
          </button>
        </header>

        <div className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-500">Scenario</span>
            {SCENARIOS.map((entry) => (
              <button key={entry.id} type="button" onClick={() => changeScenario(entry.id)} title={entry.description} className={`rounded-lg border px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wider transition ${scenario === entry.id ? 'border-cyan-300/60 bg-cyan-400/15 text-cyan-100' : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500'}`}>
                {entry.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={resetMock} className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-wider text-zinc-400 hover:border-zinc-500">
              <RotateCcw size={12} /> Reset
            </button>
            <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">Wallet 1,250</span>
          </div>
        </div>

        <main className="flex flex-1 items-start justify-center py-8 sm:py-12">
          {variant === 'compact' && <VariantCompact {...sharedProps} />}
          {variant === 'deck' && <VariantDeck {...sharedProps} />}
          {variant === 'ladder' && <VariantLadder {...sharedProps} />}
        </main>

        <div className="sticky bottom-3 mx-auto mb-3 flex w-fit items-center gap-2 rounded-full border border-cyan-200/20 bg-[#0b141b]/95 px-2 py-1.5 shadow-2xl backdrop-blur">
          <button type="button" onClick={() => moveVariant(-1)} aria-label="Previous mockup variant" className="rounded-full p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"><ChevronLeft size={15} /></button>
          {VARIANTS.map((entry) => (
            <button key={entry.id} type="button" onClick={() => selectVariant(entry.id)} className={`rounded-full px-3 py-1 text-[9px] font-bold uppercase tracking-wider transition ${variant === entry.id ? 'bg-cyan-300 text-[#061017]' : 'text-zinc-400 hover:bg-white/10 hover:text-white'}`}>
              {entry.shortLabel} · {entry.label}
            </button>
          ))}
          <button type="button" onClick={() => moveVariant(1)} aria-label="Next mockup variant" className="rounded-full p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"><ChevronRight size={15} /></button>
        </div>
      </div>
    </div>
  );
};
