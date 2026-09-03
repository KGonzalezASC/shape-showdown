from pathlib import Path

# Fix storage-toxin bare return
p = Path('server/shop.ts')
s = p.read_text(encoding='utf8')
old = """    case 'storage-toxin': {
      if (!victim.holdPiece) return;
"""
neu = """    case 'storage-toxin': {
      if (!victim.holdPiece) return false;
"""
if old not in s:
    raise SystemExit('storage-toxin return not found')
p.write_text(s.replace(old, neu), encoding='utf8')
print('fixed storage-toxin return')

# Patch puzzleSession for deferred wildcard
p = Path('server/puzzle/puzzleSession.ts')
s = p.read_text(encoding='utf8')

old_import = "import { applyScriptedShopAttack } from '../shop.js';"
neu_import = "import { applyScriptedShopAttack } from '../shop.js';\n// canApplyWildcardFour is enforced inside applyScriptedShopAttack('wildcard-four')"
# keep import as-is, just use return value

# Add deferred field to class
old_fields = """  private timelineIndex = 0;
  private pieceLocks = 0;
  private solved = false;
  private topOut = false;
  private reported: PuzzleSessionReport | null = null;"""

neu_fields = """  private timelineIndex = 0;
  private pieceLocks = 0;
  private solved = false;
  private topOut = false;
  private reported: PuzzleSessionReport | null = null;
  /** Wildcard beats deferred until poison is stacked and spread has finished. */
  private deferredWildcards: Array<Record<string, unknown>> = [];"""

if old_fields not in s:
    raise SystemExit('fields block not found')
s = s.replace(old_fields, neu_fields)

# Change applyHazard wildcard to return whether applied; change applyHazard return type
old_apply = """/** Apply one scripted hazard to the player (mirrors shop attack semantics). */
function applyHazard(player: PlayerState, kind: HazardKind, params: Record<string, unknown> | undefined, tick: number): void {
  const p = params ?? {};
  switch (kind) {
    case 'poison':
      applyScriptedShopAttack('elixir-pulse', player, tick, p);
      break;
    case 'storage-poison':
      applyScriptedShopAttack('storage-toxin', player, tick, p);
      break;
    case 'retrim':
      applyScriptedShopAttack('retrim', player, tick, p);
      break;
    case 'curtain':
      applyScriptedShopAttack('curtain', player, tick, p);
      break;
    case 'freeze':
      applyScriptedShopAttack('frost-shift', player, tick, p);
      break;
    case 'magnet':
      applyScriptedShopAttack('gravity-lure', player, tick, p);
      break;
    case 'snag':
      applyScriptedShopAttack('fortify-frame', player, tick, p);
      break;
    case 'sticky':
      applyScriptedShopAttack('quickstep-clock', player, tick, p);
      break;
    case 'purge':
      applyScriptedShopAttack('vortex-step', player, tick, p);
      break;
    case 'wildcard':
      applyScriptedShopAttack('wildcard-four', player, tick, p);
      break;"""

neu_apply = """/** Apply one scripted hazard to the player (mirrors shop attack semantics).
 *  Returns false only for wildcard when the spread-before-shape gate blocks apply
 *  (caller should defer and retry).
 */
function applyHazard(player: PlayerState, kind: HazardKind, params: Record<string, unknown> | undefined, tick: number): boolean {
  const p = params ?? {};
  switch (kind) {
    case 'poison':
      applyScriptedShopAttack('elixir-pulse', player, tick, p);
      return true;
    case 'storage-poison':
      applyScriptedShopAttack('storage-toxin', player, tick, p);
      return true;
    case 'retrim':
      applyScriptedShopAttack('retrim', player, tick, p);
      return true;
    case 'curtain':
      applyScriptedShopAttack('curtain', player, tick, p);
      return true;
    case 'freeze':
      applyScriptedShopAttack('frost-shift', player, tick, p);
      return true;
    case 'magnet':
      applyScriptedShopAttack('gravity-lure', player, tick, p);
      return true;
    case 'snag':
      applyScriptedShopAttack('fortify-frame', player, tick, p);
      return true;
    case 'sticky':
      applyScriptedShopAttack('quickstep-clock', player, tick, p);
      return true;
    case 'purge':
      applyScriptedShopAttack('vortex-step', player, tick, p);
      return true;
    case 'wildcard':
      return applyScriptedShopAttack('wildcard-four', player, tick, p);"""

if old_apply not in s:
    raise SystemExit('applyHazard block not found')
s = s.replace(old_apply, neu_apply)

# Fix remaining cases in applyHazard that still use break
old_rest = """    case 'bomber': {
      // Bomber is a self-buff in multiplayer; timeline applies it to the puzzle player.
      applyBomberToBuyer(player);
      pushFieldEffect(player, 'bomber', tick, 'Bomber', '💣', tick + 240);
      break;
    }
    case 'garbage': {
      const lines = typeof p.lines === 'number' ? p.lines : 1;
      const arrivalTick = tick + (typeof p.delayTicks === 'number' ? p.delayTicks : GARBAGE_ARRIVAL_DELAY_TICKS);
      player.pendingGarbage.push({ lines, arrivalTick });
      break;
    }
    case 'satellite':
    case 'tectonic':
      throw new Error(`Unsupported puzzle hazard in session: ${kind}`);
  }
}"""

neu_rest = """    case 'bomber': {
      // Bomber is a self-buff in multiplayer; timeline applies it to the puzzle player.
      applyBomberToBuyer(player);
      pushFieldEffect(player, 'bomber', tick, 'Bomber', '💣', tick + 240);
      return true;
    }
    case 'garbage': {
      const lines = typeof p.lines === 'number' ? p.lines : 1;
      const arrivalTick = tick + (typeof p.delayTicks === 'number' ? p.delayTicks : GARBAGE_ARRIVAL_DELAY_TICKS);
      player.pendingGarbage.push({ lines, arrivalTick });
      return true;
    }
    case 'satellite':
    case 'tectonic':
      throw new Error(`Unsupported puzzle hazard in session: ${kind}`);
  }
}"""

if old_rest not in s:
    raise SystemExit('applyHazard rest not found')
s = s.replace(old_rest, neu_rest)

# Update advance() timeline firing + flush deferred
old_adv = """      // Fire due timeline events (the scripted \"opponent\").
      while (this.timelineIndex < this.timeline.length && this.timeline[this.timelineIndex].tick <= this.gameState.tick) {
        const event = this.timeline[this.timelineIndex];
        this.timelineIndex += 1;
        if (event.kind === 'garbage') {
          applyHazard(this.getPlayerState(), 'garbage', event.params, this.gameState.tick);
        } else {
          applyHazard(this.getPlayerState(), event.kind, event.params, this.gameState.tick);
        }
      }"""

neu_adv = """      // Fire due timeline events (the scripted \"opponent\").
      while (this.timelineIndex < this.timeline.length && this.timeline[this.timelineIndex].tick <= this.gameState.tick) {
        const event = this.timeline[this.timelineIndex];
        this.timelineIndex += 1;
        if (event.kind === 'garbage') {
          applyHazard(this.getPlayerState(), 'garbage', event.params, this.gameState.tick);
        } else if (event.kind === 'wildcard') {
          const applied = applyHazard(this.getPlayerState(), 'wildcard', event.params, this.gameState.tick);
          if (!applied) this.deferredWildcards.push(event.params ?? {});
        } else {
          applyHazard(this.getPlayerState(), event.kind, event.params, this.gameState.tick);
        }
      }

      // Retry deferred wildcards once poison spread has finished (shape gate).
      if (this.deferredWildcards.length > 0) {
        const player = this.getPlayerState();
        const remaining: Array<Record<string, unknown>> = [];
        for (const params of this.deferredWildcards) {
          if (!applyScriptedShopAttack('wildcard-four', player, this.gameState.tick, params)) {
            remaining.push(params);
          }
        }
        this.deferredWildcards = remaining;
      }"""

if old_adv not in s:
    raise SystemExit('advance timeline block not found')
s = s.replace(old_adv, neu_adv)

p.write_text(s, encoding='utf8')
print('patched puzzleSession.ts')
