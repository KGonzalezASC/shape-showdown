import fs from 'node:fs';

const path = 'server/puzzle/puzzleSession.ts';
let s = fs.readFileSync(path, 'utf8');

// Update imports
if (!s.includes("applyScriptedShopAttack")) {
  s = s.replace(
    "import { pushFieldEffect } from '../../src/shop/fieldEffects.js';",
    "import { applyScriptedShopAttack } from '../shop.js';\nimport { applyBomberToBuyer } from '../puzzleEngine/engine.js';\nimport { pushFieldEffect } from '../../src/shop/fieldEffects.js';\nimport {\n  GARBAGE_ARRIVAL_DELAY_TICKS,\n} from '../../src/constants.js';",
  );
}

const start = s.indexOf('/** Apply one scripted hazard');
const end = s.indexOf('export class PuzzleSession');
if (start < 0 || end < 0) throw new Error('markers missing for applyHazard');

const newFn = `/** Apply one scripted hazard to the player (mirrors shop attack semantics). */
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
      break;
    case 'bomber': {
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
      throw new Error(\`Unsupported puzzle hazard in session: \${kind}\`);
  }
}

`;

s = s.slice(0, start) + newFn + s.slice(end);
fs.writeFileSync(path, s);
console.log('updated puzzleSession applyHazard');
