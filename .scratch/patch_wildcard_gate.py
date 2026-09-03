from pathlib import Path

p = Path('server/shop.ts')
s = p.read_text(encoding='utf8')

old_fn = """function opponentHasPoison(opponent: PlayerState): boolean {
  const poison = opponent.poisonBoard ?? [];
  for (let y = 0; y < BOARD_ROWS; y++) {
    for (let x = 0; x < BOARD_COLS; x++) {
      if (poison[y]?.[x] > 0) return true;
    }
  }
  return false;
}"""

neu_fn = """function opponentHasPoison(opponent: PlayerState): boolean {
  const poison = opponent.poisonBoard ?? [];
  for (let y = 0; y < BOARD_ROWS; y++) {
    for (let x = 0; x < BOARD_COLS; x++) {
      if (poison[y]?.[x] > 0) return true;
    }
  }
  return false;
}

/**
 * Wildcard +4 may only resolve once poison is on the stack AND spread has
 * finished. Mid-spread seed cells must not lock the copied shape/colour.
 */
export function canApplyWildcardFour(opponent: PlayerState): boolean {
  if (!opponentHasPoison(opponent)) return false;
  if (opponent.poisonSpread != null) return false;
  return true;
}"""

if old_fn not in s:
    raise SystemExit('opponentHasPoison not found')
s = s.replace(old_fn, neu_fn)

old_can = "canPurchase: ({ opponent }) => !!opponent && opponentHasPoison(opponent),"
neu_can = "canPurchase: ({ opponent }) => !!opponent && canApplyWildcardFour(opponent),"
if old_can not in s:
    raise SystemExit('canPurchase gate not found')
s = s.replace(old_can, neu_can)

old_sig = """export function applyScriptedShopAttack(
  itemId: ScriptedShopAttackId,
  victim: PlayerState,
  tick: number,
  params: Record<string, unknown> = {},
): void {
  const variantParam = typeof params.variant === 'number' ? params.variant : undefined;

  switch (itemId) {"""

neu_sig = """export function applyScriptedShopAttack(
  itemId: ScriptedShopAttackId,
  victim: PlayerState,
  tick: number,
  params: Record<string, unknown> = {},
): boolean {
  const variantParam = typeof params.variant === 'number' ? params.variant : undefined;

  switch (itemId) {"""

if old_sig not in s:
    raise SystemExit('applyScriptedShopAttack sig not found')
s = s.replace(old_sig, neu_sig)

old_wc = """    case 'wildcard-four': {
      if (!opponentHasPoison(victim)) return;
      const poison = victim.poisonBoard ?? [];
      let component = findLargestPoisonComponent(poison);
      if (!component) return;
      if (variantParam !== undefined) {"""

neu_wc = """    case 'wildcard-four': {
      if (!canApplyWildcardFour(victim)) return false;
      const poison = victim.poisonBoard ?? [];
      let component = findLargestPoisonComponent(poison);
      if (!component) return false;
      if (variantParam !== undefined) {"""

if old_wc not in s:
    raise SystemExit('scripted wildcard start not found')
s = s.replace(old_wc, neu_wc)

old_wc_end = """      const candidates = wildcardCandidates(component.cells, WILDCARD_FOUR_MAX_CELLS);
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
    }"""

neu_wc_end = """      const candidates = wildcardCandidates(component.cells, WILDCARD_FOUR_MAX_CELLS);
      if (candidates.length === 0) return false;
      // Deterministic: first sorted candidate (no rng).
      const candidate = candidates[0]!;
      const targetCells = candidate.cells;
      victim.customNextPieceOffsets = poisonCellsToOffsets(targetCells);
      victim.customNextPieceVariant = component.variant;
      victim.customNextPieceSourceCells = targetCells.map((cell) => [cell.x, cell.y]);
      victim.wildcardLastSeed = [candidate.seed.x, candidate.seed.y];
      victim.wildcardLastShapeKey = candidate.shapeKey;
      pushFieldEffect(victim, 'wildcard-four', tick, 'Wildcard +4', '🧩', tick + 240);
      return true;
    }"""

if old_wc_end not in s:
    raise SystemExit('scripted wildcard end not found')
s = s.replace(old_wc_end, neu_wc_end)

# Convert remaining `break;` in the switch to `return true;` and add default
# Find the switch closing — after all cases. Replace each case's trailing break with return true
# Safer: replace all `      break;\n    }\n    case` patterns inside applyScriptedShopAttack

# Identify the function body after our edits and rewrite breaks for non-wildcard cases.
marker = "export function applyScriptedShopAttack("
idx = s.index(marker)
# Find end of function: next export function or end — look for "export function applyShopPurchase"
end_marker = "export function applyShopPurchase"
end = s.index(end_marker, idx)
fn = s[idx:end]
# Replace break; that close cases with return true; — but not inside nested blocks carefully.
# All cases in this switch use `      break;` at case end (6 spaces).
fn2 = fn.replace("\n      break;\n    }", "\n      return true;\n    }")
# Add default return false before switch close
if "default:" not in fn2.split("switch (itemId)")[1]:
    fn2 = fn2.replace(
        "\n  }\n}\n\n",
        "\n    default:\n      return false;\n  }\n}\n\n",
        1,
    )
s = s[:idx] + fn2 + s[end:]

p.write_text(s, encoding='utf8')
print('patched shop.ts')
