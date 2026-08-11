import {
  BOMBER_COST,
  CURTAIN_COST,
  FREEZE_COST,
  MAGNET_COST,
  POISON_COST,
  POISON_PURGE_COST,
  STORAGE_POISON_COST,
  RETRIM_COST,
  SATELLITE_COST,
  SNAG_COST,
  STICKY_COST,
  BOUNTY_TAX_COST,
  WILDCARD_FOUR_COST,
  TECTONIC_SHIFT_COST,
  ShopItem,
} from '../types';

/**
 * Canonical shop catalog — single source of truth for cost, target, and purchasability.
 * Non-purchasable stubs must set `purchasable: false` so they never enter rolls.
 */
export const SHOP_CATALOG: ShopItem[] = [
  {
    id: 'bounty-tax',
    name: 'Tax Siphon',
    icon: '💸',
    cost: BOUNTY_TAX_COST,
    tier: 2,
    baseWeight: 2.25,
    purchasable: true,
    target: 'opponent',
    colorClass: 'bg-emerald-950/70',
    borderColorClass: 'border-emerald-400/65',
    description:
      "Steals 30% of the opponent's current funds (only works if they have more funds than you).",
  },
  {
    id: 'retrim',
    name: 'Re-Trim',
    icon: '✂️',
    cost: RETRIM_COST,
    tier: 2,
    baseWeight: 2.25,
    purchasable: true,
    target: 'opponent',
    colorClass: 'bg-rose-900/70',
    borderColorClass: 'border-rose-300/65',
    description:
      "Permanently moves the opponent's swap line up 1 row (capped at row 5). Each purchase also grants you permanent +1 Curtain defense (+1 visible glassy frost row against opponent Curtains).",
  },
  {
    id: 'curtain',
    name: 'Curtain',
    icon: '🎭',
    cost: CURTAIN_COST,
    tier: 2,
    baseWeight: 2.25,
    purchasable: true,
    target: 'opponent',
    colorClass: 'bg-indigo-900/70',
    borderColorClass: 'border-indigo-300/65',
    description: "Frosts the opponent's field below their swap line for 4 seconds.",
    synergyTargetId: 'retrim',
    synergyBoost: 2.5,
  },
  {
    id: 'nova-charge',
    name: 'Bomber',
    icon: '💣',
    cost: BOMBER_COST,
    tier: 2,
    baseWeight: 2.25,
    purchasable: true,
    target: 'self',
    colorClass: 'bg-rose-900/70',
    borderColorClass: 'border-rose-300/65',
    description:
      'Arms your current piece (or next spawn) — on lock it blasts a circle out of your stack (holes only). You can park it in storage and deploy when ready.',
  },
  {
    id: 'gravity-lure',
    name: 'Magnet',
    icon: '🧲',
    cost: MAGNET_COST,
    tier: 2,
    baseWeight: 2.25,
    purchasable: true,
    target: 'opponent',
    colorClass: 'bg-violet-900/70',
    borderColorClass: 'border-violet-300/65',
    description:
      'Pulls the opponent down faster — first 3 buys add +2 gravity each (max +6); later buys add +1 on their current piece until it locks (rainbow edge while falling).',
  },
  {
    id: 'frost-shift',
    name: 'Freeze',
    icon: '❄️',
    cost: FREEZE_COST,
    tier: 2,
    baseWeight: 2.25,
    purchasable: true,
    target: 'opponent',
    colorClass: 'bg-sky-900/70',
    borderColorClass: 'border-sky-300/65',
    description:
      "Locks the opponent's storage for 10s — they cannot store into an empty hold or swap with a stored piece.",
  },
  {
    id: 'elixir-pulse',
    name: 'Elixir',
    icon: '🧪',
    cost: POISON_COST,
    tier: 2,
    baseWeight: 2.25,
    purchasable: true,
    target: 'opponent',
    colorClass: 'bg-lime-900/70',
    borderColorClass: 'border-lime-300/65',
    description:
      "Poisons the opponent's active piece — it infects the stack it locks into, spreading for 4 waves. They cannot store it away.",
  },
  {
    id: 'storage-toxin',
    name: 'Contagion',
    icon: '🦠',
    cost: STORAGE_POISON_COST,
    tier: 2,
    baseWeight: 2.25,
    purchasable: true,
    target: 'opponent',
    colorClass: 'bg-lime-950/70',
    borderColorClass: 'border-lime-400/65',
    description:
      "Poisons the opponent's stored piece — when they swap it onto the field it seeds poison on lock. Requires something in storage.",
  },
  {
    id: 'vortex-step',
    name: 'Wild Purge',
    icon: '🃏',
    cost: POISON_PURGE_COST,
    tier: 2,
    baseWeight: 2.25,
    purchasable: true,
    target: 'opponent',
    colorClass: 'bg-fuchsia-900/70',
    borderColorClass: 'border-fuchsia-300/65',
    description:
      "Rolls a random poison colour, then after a short delay deletes every cell of that colour on the opponent's stack — holes only, no gravity and no line-clear credit.",
    synergyTargetId: 'elixir-pulse',
    synergyBoost: 2.5,
  },
  {
    id: 'wildcard-four',
    name: 'Wildcard +4',
    icon: '🧩',
    cost: WILDCARD_FOUR_COST,
    tier: 2,
    baseWeight: 2.25,
    purchasable: true,
    target: 'opponent',
    colorClass: 'bg-fuchsia-950/70',
    borderColorClass: 'border-fuchsia-400/65',
    description:
      "Copies the largest connected poison blotch on the opponent's stack (up to 6 cells) onto their next falling piece.",
    synergyTargetId: 'elixir-pulse',
    synergyBoost: 2.5,
  },
  {
    id: 'fortify-frame',
    name: 'Snag',
    icon: '🪝',
    cost: SNAG_COST,
    tier: 2,
    baseWeight: 2.25,
    purchasable: true,
    target: 'opponent',
    colorClass: 'bg-orange-900/70',
    borderColorClass: 'border-orange-300/65',
    description:
      "Hooks the opponent's piece — no hard drop until it locks. Current piece if not dropped yet, otherwise the next spawn.",
  },
  {
    id: 'quickstep-clock',
    name: 'Sticky',
    icon: '⏱️',
    cost: STICKY_COST,
    tier: 2,
    baseWeight: 2.25,
    purchasable: true,
    target: 'opponent',
    colorClass: 'bg-teal-900/70',
    borderColorClass: 'border-teal-300/65',
    description: 'Opponent gets only 2 lock-move resets per piece (Sticky) until they clear a line.',
  },
  {
    id: 'satellite-link',
    name: 'Satellite',
    icon: '🛰️',
    cost: SATELLITE_COST,
    tier: 2,
    baseWeight: 2.25,
    purchasable: true,
    target: 'self',
    colorClass: 'bg-zinc-800/80',
    borderColorClass: 'border-zinc-300/60',
    description:
      'Arms until garbage arrives — then pushes queued lines back and slows new garbage for 10s.',
  },
  {
    id: 'tectonic-shift',
    name: 'Tectonic Shift',
    icon: '🪐',
    cost: TECTONIC_SHIFT_COST,
    tier: 2,
    baseWeight: 2.25,
    purchasable: true,
    target: 'self',
    colorClass: 'bg-indigo-950/70',
    borderColorClass: 'border-indigo-400/65',
    description:
      'Animates all columns collapsing downward to fill holes. Cleared lines award no points, garbage, or shop rolls.',
  },
];

/** Items eligible for weighted rolls. */
export const SHOP_ROLL_POOL = SHOP_CATALOG.filter((item) => item.purchasable);

export const SHOP_ITEM_BY_ID = new Map(SHOP_CATALOG.map((item) => [item.id, item]));

export function resolveShopOffers(offerIds: string[]): ShopItem[] {
  return offerIds
    .map((id) => SHOP_ITEM_BY_ID.get(id))
    .filter((item): item is ShopItem => item !== undefined);
}

/** @deprecated Use SHOP_CATALOG / SHOP_ROLL_POOL. */
export const SHOP_MOCK_POOL = SHOP_ROLL_POOL;
