from pathlib import Path

path = Path("server/puzzle/puzzleSession.ts")
text = path.read_text(encoding="utf-8")

old_import = "import { pushFieldEffect } from '../../src/shop/fieldEffects.js';"
new_import = "import { ensureWildcardIncomingEffect, pushFieldEffect } from '../../src/shop/fieldEffects.js';"
if old_import not in text:
    raise SystemExit("import not found")
text = text.replace(old_import, new_import, 1)

old_block = """        } else if (event.kind === 'wildcard') {
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
      }
"""

new_block = """        } else if (event.kind === 'wildcard') {
          const player = this.getPlayerState();
          const applied = applyHazard(player, 'wildcard', event.params, this.gameState.tick);
          if (!applied) {
            this.deferredWildcards.push(event.params ?? {});
            // Keep telegraph visible until shape actually locks (gate may delay apply).
            ensureWildcardIncomingEffect(player, this.gameState.tick);
          }
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
            ensureWildcardIncomingEffect(player, this.gameState.tick);
          }
        }
        this.deferredWildcards = remaining;
      }
"""

if old_block not in text:
    raise SystemExit("defer block not found")
text = text.replace(old_block, new_block, 1)

# Add getter for pending hazard kinds near getPlayerState
marker = "  public getPlayerState(): PlayerState {\n    return this.gameState.players.puzzle!;\n  }"
insertion = """  public getPlayerState(): PlayerState {
    return this.gameState.players.puzzle!;
  }

  /** Timeline kinds still waiting on a deferred apply (solo telegraph). */
  public getPendingHazardKinds(): string[] {
    return this.deferredWildcards.length > 0 ? ['wildcard'] : [];
  }"""
if marker not in text:
    raise SystemExit("getPlayerState marker not found")
text = text.replace(marker, insertion, 1)

path.write_text(text, encoding="utf-8")
print("updated puzzleSession.ts")
