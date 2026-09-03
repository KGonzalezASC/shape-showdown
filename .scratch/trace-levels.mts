import { buildAuthoredLevels } from '../server/puzzle/catalog/authoredLevels.js';
import { PuzzleSession } from '../server/puzzle/puzzleSession.js';
import { createRulesBotFromProfile, DEFAULT_RULES_BOT_PROFILE } from '../server/testHarness/rulesBot.js';

const levels = buildAuthoredLevels();

export interface LevelTrace {
  id: string;
  name: string;
  goal: any;
  hold: boolean;
  totalPieces: number;
  totalTicks: number;
  solved: boolean;
  timeline: any[];
  eventsFired: Array<{
    tick: number;
    kind: string;
    params?: any;
    piecesLocked: number;
    playerHeight: number;
    boardPoisonCells: number;
    holdPiece: string | null;
    holdFrozen: boolean;
    curtainActive: boolean;
    gravityReduction: number;
  }>;
}

const traces: LevelTrace[] = [];

for (const level of levels) {
  const driver = createRulesBotFromProfile(DEFAULT_RULES_BOT_PROFILE);
  const session = new PuzzleSession({ level, driver, maxTicks: 60 * 60 });
  
  // Advance tick-by-tick to trace exact event application
  const eventsFired: LevelTrace['eventsFired'] = [];
  let prevActiveEffectsCount = 0;
  
  // We can track events by monkey-patching or by watching session state
  const rawState = (session as any).gameState;
  const player = rawState.players.puzzle;
  
  let lastTimelineIdx = 0;
  let lastPieceTimelineIdx = 0;
  
  while (rawState.status === 'playing' && rawState.tick < 3600) {
    const tickBefore = rawState.tick;
    const tlIdxBefore = (session as any).timelineIndex;
    const ptlIdxBefore = (session as any).pieceTimelineIndex;
    
    session.advance(1);
    
    const tlIdxAfter = (session as any).timelineIndex;
    const ptlIdxAfter = (session as any).pieceTimelineIndex;
    
    if (tlIdxAfter > tlIdxBefore) {
      for (let i = tlIdxBefore; i < tlIdxAfter; i++) {
        const item = (session as any).timeline[i];
        if (item) {
          // calculate player stack height
          let height = 0;
          let poison = 0;
          for (let y = 0; y < 20; y++) {
            for (let x = 0; x < 10; x++) {
              if (player.board[y][x] !== null) {
                if (20 - y > height) height = 20 - y;
              }
              if (player.poisonBoard && player.poisonBoard[y][x] > 0) poison++;
            }
          }
          eventsFired.push({
            tick: tickBefore,
            kind: item.kind,
            params: item.params,
            piecesLocked: (session as any).pieceLocks,
            playerHeight: height,
            boardPoisonCells: poison,
            holdPiece: player.holdPiece ? player.holdPiece.shape : null,
            holdFrozen: (player.holdFrozenUntilTick ?? 0) > tickBefore,
            curtainActive: (player.activeEffects ?? []).some((e: any) => e.kind === 'curtain' || e.kind === 'curtain-warn'),
            gravityReduction: (player.magnetPermanentStacks ?? 0) * 2 + (player.magnetPieceBoost ?? 0),
          });
        }
      }
    }
    
    if (ptlIdxAfter > ptlIdxBefore) {
      for (let i = ptlIdxBefore; i < ptlIdxAfter; i++) {
        const item = (session as any).pieceTimeline[i];
        if (item) {
          let height = 0;
          let poison = 0;
          for (let y = 0; y < 20; y++) {
            for (let x = 0; x < 10; x++) {
              if (player.board[y][x] !== null) {
                if (20 - y > height) height = 20 - y;
              }
              if (player.poisonBoard && player.poisonBoard[y][x] > 0) poison++;
            }
          }
          eventsFired.push({
            tick: tickBefore,
            kind: `[piece:${item.afterPieces}] ` + item.kind,
            params: item.params,
            piecesLocked: (session as any).pieceLocks,
            playerHeight: height,
            boardPoisonCells: poison,
            holdPiece: player.holdPiece ? player.holdPiece.shape : null,
            holdFrozen: (player.holdFrozenUntilTick ?? 0) > tickBefore,
            curtainActive: (player.activeEffects ?? []).some((e: any) => e.kind === 'curtain' || e.kind === 'curtain-warn'),
            gravityReduction: (player.magnetPermanentStacks ?? 0) * 2 + (player.magnetPieceBoost ?? 0),
          });
        }
      }
    }
  }

  traces.push({
    id: level.id,
    name: level.name,
    goal: level.goal,
    hold: level.allowHold ?? true,
    totalPieces: (session as any).pieceLocks,
    totalTicks: rawState.tick,
    solved: session.isSolved,
    timeline: level.timeline,
    eventsFired,
  });
}

import fs from 'fs';
fs.writeFileSync('.scratch/rulesbot-traces.json', JSON.stringify(traces, null, 2));
console.log(`Traced ${traces.length} levels successfully.`);
