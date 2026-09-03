import fs from 'node:fs';

const shopPath = 'server/shop.ts';
let shop = fs.readFileSync(shopPath, 'utf8');

const marker = 'export function applyShopPurchase(';
if (!shop.includes(marker)) throw new Error('applyShopPurchase marker missing');
if (shop.includes('export function applyScriptedShopAttack')) {
  console.log('shop already has applyScriptedShopAttack');
} else {
  const insert = `
/**
 * Apply a shop attack to \`victim\` as if a phantom opponent purchased \`itemId\`.
 * Used by puzzle timelines so solo hazards share multiplayer semantics.
 * Poison / vortex / storage use \`params.variant\` when provided (no rng).
 * Wildcard +4 picks the first sorted candidate (deterministic; no rng).
 */
export type ScriptedShopAttackId =
  | 'elixir-pulse'
  | 'storage-toxin'
  | 'vortex-step'
  | 'wildcard-four'
  | 'curtain'
  | 'retrim'
  | 'gravity-lure'
  | 'frost-shift'
  | 'fortify-frame'
  | 'quickstep-clock';

export function applyScriptedShopAttack(
  itemId: ScriptedShopAttackId,
  victim: PlayerState,
  tick: number,
  params: Record<string, unknown> = {},
): void {
  const variantParam = typeof params.variant === 'number' ? params.variant : undefined;

  switch (itemId) {
    case 'elixir-pulse': {
      const variant = variantParam ?? 1;
      if (victim.activePiece) {
        victim.activePiece.poisoned = true;
        victim.activePiece.poisonVariant = variant;
      } else {
        const stackEmpty = victim.board.every((row) => row.every((cell) => cell === null));
        if (!stackEmpty) {
          victim.poisonNextPiece = true;
          victim.poisonNextVariant = variant;
        }
      }
      pushFieldEffect(victim, 'poison', tick, 'Poisoned', '🧪', tick + 180);
      break;
    }
    case 'storage-toxin': {
      if (!victim.holdPiece) return;
      const variant = variantParam ?? 1;
      victim.holdPiece.poisoned = true;
      victim.holdPiece.poisonVariant = variant;
      pushFieldEffect(victim, 'storage-poison', tick, 'Storage poisoned', '🦠', tick + 180);
      break;
    }
    case 'vortex-step': {
      const variant = variantParam;
      if (variant === undefined || variant < 1 || variant > POISON_GENERATIONS) {
        throw new Error('vortex-step / purge requires params.variant in 1..POISON_GENERATIONS');
      }
      victim.pendingShopEffects.push({
        itemId: 'vortex-step',
        activationTick: tick + POISON_PURGE_TELEGRAPH_TICKS,
        poisonVariant: variant,
      });
      pushFieldEffect(
        victim,
        'purge-warn',
        tick,
        \`Wild \${POISON_VARIANT_LABELS[variant - 1]}\`,
        '🃏',
        tick + POISON_PURGE_TELEGRAPH_TICKS,
      );
      break;
    }
    case 'wildcard-four': {
      if (!opponentHasPoison(victim)) return;
      const poison = victim.poisonBoard ?? [];
      let component = findLargestPoisonComponent(poison);
      if (!component) return;
      if (variantParam !== undefined) {
        // Prefer a component matching the authored variant when present.
        const visited = Array.from({ length: BOARD_ROWS }, () =>
          Array.from({ length: BOARD_COLS }, () => false),
        );
        let best: PoisonCell[] | null = null;
        for (let y = 0; y < BOARD_ROWS; y++) {
          for (let x = 0; x < BOARD_COLS; x++) {
            if ((poison[y]?.[x] ?? 0) !== variantParam || visited[y][x]) continue;
            const cells: PoisonCell[] = [];
            const queue: PoisonCell[] = [{ x, y }];
            visited[y][x] = true;
            while (queue.length > 0) {
              const cur = queue.shift()!;
              cells.push(cur);
              for (const [nx, ny] of [
                [cur.x + 1, cur.y],
                [cur.x - 1, cur.y],
                [cur.x, cur.y + 1],
                [cur.x, cur.y - 1],
              ] as const) {
                if (ny < 0 || ny >= BOARD_ROWS || nx < 0 || nx >= BOARD_COLS) continue;
                if (visited[ny][nx]) continue;
                if ((poison[ny]?.[nx] ?? 0) !== variantParam) continue;
                visited[ny][nx] = true;
                queue.push({ x: nx, y: ny });
              }
            }
            if (!best || cells.length > best.length) best = cells;
          }
        }
        if (best) component = { cells: best, variant: variantParam };
      }
      const candidates = wildcardCandidates(component.cells, WILDCARD_FOUR_MAX_CELLS);
      if (candidates.length === 0) return;
      // Deterministic: first sorted candidate (no rng).
      const candidate = candidates[0]!;
      const targetCells = candidate.cells;
      victim.customNextPieceOffsets = poisonCellsToOffsets(targetCells);
      victim.customNextPieceVariant = component.variant;
      victim.customNextPieceSourceCells = targetCells.map((cell) => [cell.x, cell.y]);
      victim.wildcardLastSeed = [candidate.seed.x, candidate.seed.y];
      victim.wildcardLastShapeKey = candidate.shapeKey;
      pushFieldEffect(victim, 'wildcard-four', tick, 'Wildcard +4', '🧩', tick + 240);
      break;
    }
    case 'curtain': {
      victim.pendingShopEffects.push({
        itemId: 'curtain',
        activationTick: tick + CURTAIN_TELEGRAPH_TICKS,
      });
      pushFieldEffect(victim, 'curtain-warn', tick, 'Curtain incoming', '🎭', tick + CURTAIN_TELEGRAPH_TICKS);
      break;
    }
    case 'retrim': {
      // Solo teaching synergy: apply both buyer curtainDefense and victim pending trim
      // so "retrim then curtain" raises frostRows and later drops the swap line.
      victim.curtainDefenseLevel = (victim.curtainDefenseLevel ?? 0) + 1;
      pushFieldEffect(victim, 'curtain-def', tick, \`Curtain Def +\${victim.curtainDefenseLevel}\`, '🛡️', tick + 240);
      if (victim.swapCutoffRow > HOLD_SWAP_CUTOFF_MIN_ROW) {
        victim.pendingShopEffects.push({
          itemId: 'retrim',
          activationTick: tick + RETRIM_ACTIVATION_TICKS,
        });
        pushFieldEffect(victim, 'retrim', tick, 'Retrimmed', '✂️', tick + 240);
      }
      break;
    }
    case 'gravity-lure': {
      applyMagnetToOpponent(victim);
      const permanent = victim.magnetPermanentStacks ?? 0;
      const pieceBoost = victim.magnetPieceBoost ?? 0;
      const pull = permanent * 2 + pieceBoost;
      const label = pieceBoost > 0 ? \`Magnet +\${pull}\` : \`Magnet ×\${permanent} (+\${pull})\`;
      pushFieldEffect(victim, 'magnet', tick, label, '🧲', tick + 180);
      break;
    }
    case 'frost-shift': {
      const duration =
        typeof params.durationTicks === 'number' ? params.durationTicks : FREEZE_DURATION_TICKS;
      const until = tick + duration;
      victim.holdFrozenUntilTick = Math.max(victim.holdFrozenUntilTick ?? 0, until);
      pushFieldEffect(victim, 'freeze', tick, 'Frozen', '❄️', until);
      break;
    }
    case 'fortify-frame': {
      applySnagToOpponent(victim);
      pushFieldEffect(victim, 'snag', tick, 'Snagged', '🪝', tick + 180);
      break;
    }
    case 'quickstep-clock': {
      applyStickyToActivePiece(victim);
      pushFieldEffect(victim, 'sticky', tick, 'Sticky', '⏱️');
      break;
    }
    default: {
      const _exhaustive: never = itemId;
      throw new Error(\`Unsupported scripted shop attack: \${_exhaustive}\`);
    }
  }
}

`;
  shop = shop.replace(marker, insert + marker);
  fs.writeFileSync(shopPath, shop);
  console.log('inserted applyScriptedShopAttack into shop.ts');
}
