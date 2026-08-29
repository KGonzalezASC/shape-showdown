/**
 * Scratch measurement: replay bot-vs-bot matches through the real MatchPacketSync
 * and record per-seat wire bytes by packet kind and delta section.
 *
 * Run: bun run .scratch/measure-netcast.mts
 */
import { createPlayerRngChannels, type RngChannels } from '../src/rng.js';
import type { GameState, MatchEvent } from '../src/types.js';
import { makePlayer, tickSeconds } from '../server/puzzleEngine/engine.js';
import { matchStep } from '../server/puzzleEngine/matchStep.js';
import { MatchPacketSync } from '../server/sync/MatchPacketSync.js';
import { RulesBot } from '../server/testHarness/rulesBot.js';
import { defaultObservationProjector } from '../server/testHarness/observationProjector.js';
import { readPacketHeader, encodeDeltaPacket } from '../src/protocol/encodeMatchPacket.js';
import { cloneSeatSnapshot } from '../src/protocol/decodeMatchPacket.js';
import { buildSeatWireSnapshot } from '../server/sync/seatProjection.js';
import type { SeatWireSnapshot } from '../src/protocol/wireTypes.js';
import {
  KEYFRAME_INTERVAL_TICKS,
  PACKET_KIND_DELTA,
  PACKET_KIND_KEYFRAME,
  PACKET_KIND_TECTONIC_COMPLETE,
  PACKET_KIND_TECTONIC_STEP,
} from '../src/protocol/version.js';

const SEEDS = [2029, 4101, 7717];
const MAX_TICKS_PER_SEED = 7200; // 120 simulated seconds per seed
const NETCAST_EVERY_N_TICKS = Number(process.env.NETCAST_HZ ? Math.round(60 / Number(process.env.NETCAST_HZ)) : 2);
const LOBBY_EVERY_N_TICKS = Math.max(NETCAST_EVERY_N_TICKS, 12);
// Real runtimeIds are durable UUIDs (36 chars); short ids would flatter writeString(id).
const ID_A = '0f14d0ab-9605-4a62-a9e4-5ed26688389b';
const ID_B = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

interface RecordedPacket {
  kind: number;
  bytes: number;
  sections: number;
}
interface SeatRecorder {
  packets: RecordedPacket[];
  eventJsonBytes: number;
  eventCount: number;
}

function makeSeatRecorder(): SeatRecorder {
  return { packets: [], eventJsonBytes: 0, eventCount: 0 };
}

function makeFakeSocket(recorder: SeatRecorder): any {
  return {
    id: `fake-${Math.random().toString(36).slice(2)}`,
    emit(event: string, payload: unknown) {
      if (event === 'gamePacket') {
        const buffer = payload as ArrayBuffer;
        const header = readPacketHeader(buffer);
        let sections = 0;
        if (header.kind === PACKET_KIND_DELTA) {
          sections = new DataView(buffer).getUint16(14, true);
        }
        recorder.packets.push({ kind: header.kind, bytes: buffer.byteLength, sections });
      }
    },
  };
}

interface SeedResult {
  seed: number;
  ticksPlayed: number;
  seats: Record<string, SeatRecorder>;
  whatIf: Record<string, WhatIfStats>;
  whatIfIdsKept: Record<string, WhatIfStats>;
}

function runSeed(seed: number): SeedResult {
  const rngChannelsByPlayer = new Map<string, RngChannels>();
  const players: GameState['players'] = {};
  [[ID_A, 0], [ID_B, 1]].forEach(([id, slot]) => {
    const channels = createPlayerRngChannels(seed, slot as number);
    rngChannelsByPlayer.set(id as string, channels);
    players[id as string] = makePlayer(id as string, channels);
  });
  const gameState: GameState = {
    players,
    status: 'playing',
    countdown: 0,
    winnerId: null,
    tick: 0,
    seed,
  };

  const drivers: Record<string, RulesBot> = {
    [ID_A]: new RulesBot({ mode: 'omniscient', topology: 'none', garbageEnabled: true }),
    [ID_B]: new RulesBot({ mode: 'omniscient', topology: 'none', garbageEnabled: true }),
  };

  const seats: Record<string, SeatRecorder> = {
    [ID_A]: makeSeatRecorder(),
    [ID_B]: makeSeatRecorder(),
  };
  const sockets = new Map<string, any>([
    [ID_A, makeFakeSocket(seats[ID_A])],
    [ID_B, makeFakeSocket(seats[ID_B])],
  ]);
  const sync = new MatchPacketSync({
    netcastEveryNTicks: NETCAST_EVERY_N_TICKS,
    lobbyNetcastEveryNTicks: LOBBY_EVERY_N_TICKS,
  });
  const whatIf: Record<string, { stats: WhatIfStats; state: { sinceEmit: number; baseline: SeatWireSnapshot | null } }> = {
    [ID_A]: { stats: { packets: 0, bytes: 0, skippedNoChange: 0, metaFireCount: 0 }, state: { sinceEmit: 0, baseline: null } },
    [ID_B]: { stats: { packets: 0, bytes: 0, skippedNoChange: 0, metaFireCount: 0 }, state: { sinceEmit: 0, baseline: null } },
  };
  const whatIfIdsKept: typeof whatIf = {
    [ID_A]: { stats: { packets: 0, bytes: 0, skippedNoChange: 0, metaFireCount: 0 }, state: { sinceEmit: 0, baseline: null } },
    [ID_B]: { stats: { packets: 0, bytes: 0, skippedNoChange: 0, metaFireCount: 0 }, state: { sinceEmit: 0, baseline: null } },
  };

  // Warm baselines so early packets behave like a joined match.
  for (const [runtimeId, socket] of sockets.entries()) {
    sync.sendKeyframe(socket, runtimeId, gameState);
  }

  let lastTickEvents: MatchEvent[] = [];
  let ticks = 0;
  for (; ticks < MAX_TICKS_PER_SEED; ticks += 1) {
    sync.capturePreStepBoards(gameState);

    for (const id of [ID_A, ID_B]) {
      const obs = defaultObservationProjector.project(gameState, id, 'omniscient');
      const cmd = drivers[id].next({ tick: gameState.tick, replayTick: gameState.tick, player: obs });
      const raw = gameState.players[id];
      if (cmd.inputState) {
        raw.inputState = {
          left: !!cmd.inputState.left,
          right: !!cmd.inputState.right,
          softDrop: !!cmd.inputState.softDrop,
        };
      }
      if (cmd.actions?.length) raw.actionQueue.push(...cmd.actions);
    }

    const res = matchStep(gameState, rngChannelsByPlayer, { enableShop: true, enableGarbage: true });

    for (const ev of res.events) {
      if (!sync.shouldEmitMatchEvent(ev)) continue;
      const json = JSON.stringify(ev);
      for (const seat of Object.values(seats)) {
        seat.eventJsonBytes += json.length + 4; // ~socket.io text frame overhead
        seat.eventCount += 1;
      }
    }

    sync.onTick(gameState, sockets, [...lastTickEvents, ...res.events]);
    lastTickEvents = [];
    for (const id of [ID_A, ID_B]) {
      runWhatIfStream(gameState, id, whatIf[id].stats, whatIf[id].state, true);
      runWhatIfStream(gameState, id, whatIfIdsKept[id].stats, whatIfIdsKept[id].state, false);
    }

    if (res.matchEnded || gameState.status !== 'playing') break;
  }
  return {
    seed,
    ticksPlayed: gameState.tick,
    seats,
    whatIf: Object.fromEntries(Object.entries(whatIf).map(([k, v]) => [k, v.stats])),
    whatIfIdsKept: Object.fromEntries(Object.entries(whatIfIdsKept).map(([k, v]) => [k, v.stats])),
  };
}

const KIND_NAMES: Record<number, string> = {
  [PACKET_KIND_KEYFRAME]: 'keyframe',
  [PACKET_KIND_DELTA]: 'delta',
  [PACKET_KIND_TECTONIC_STEP]: 'tectonicStep',
  [PACKET_KIND_TECTONIC_COMPLETE]: 'tectonicComplete',
};

const SECTION_BITS: Array<[number, string]> = [
  [1 << 0, 'chrome'],
  [1 << 1, 'localBoard'],
  [1 << 2, 'localPoison'],
  [1 << 3, 'localMeta'],
  [1 << 4, 'localShop'],
  [1 << 5, 'oppBoard'],
  [1 << 6, 'oppMeta'],
  [1 << 7, 'oppPoison'],
];

/**
 * What-if transform: store absolute ticks on the wire instead of
 * tick-relative countdowns (client relativizes via header tick), so timer
 * fields stop churning every sim tick. Also empties seat id strings, which
 * are constant after join and do not belong in per-tick deltas.
 */
function stabilizeSnapshot(s: SeatWireSnapshot, stripIds: boolean): SeatWireSnapshot {
  const tick = s.tick;
  const toAbs = (v: number | null | undefined): number | null =>
    v === null || v === undefined ? null : tick + v;
  const relGarbage = (list: { lines: number; ticksUntilArrival?: number }[]) =>
    list.map((g) => ({ lines: g.lines, ticksUntilArrival: toAbs(g.ticksUntilArrival) ?? undefined }));
  const relEffects = (
    list: { id: string; kind: any; label: string; expiresAtTick?: number; icon?: string }[],
  ) => list.map((e) => ({ ...e, expiresAtTick: e.expiresAtTick !== undefined ? tick + e.expiresAtTick : undefined }));
  const relSpread = (spread: { generationsRemaining: number; nextSpreadTick: number; variant: number } | null) =>
    spread ? { ...spread, nextSpreadTick: tick + spread.nextSpreadTick } : null;
  return {
    ...s,
    local: {
      ...s.local,
      id: stripIds ? '' : s.local.id,
      landingForecastTicksRemaining: toAbs(s.local.landingForecastTicksRemaining) ?? undefined,
      pendingGarbage: relGarbage(s.local.pendingGarbage),
      activeEffects: relEffects(s.local.activeEffects),
      poisonSpread: relSpread(s.local.poisonSpread),
      holdFrozenUntilTick: s.local.holdFrozenUntilTick !== undefined ? tick + s.local.holdFrozenUntilTick : undefined,
      satelliteDelayUntilTick: s.local.satelliteDelayUntilTick !== undefined ? tick + s.local.satelliteDelayUntilTick : undefined,
      tectonicShiftNextStepTick: toAbs(s.local.tectonicShiftNextStepTick),
    },
    opponent: {
      ...s.opponent,
      id: stripIds ? '' : s.opponent.id,
      pendingGarbage: relGarbage(s.opponent.pendingGarbage),
      activeEffects: relEffects(s.opponent.activeEffects),
      poisonSpread: relSpread(s.opponent.poisonSpread),
      tectonicShiftNextStepTick: toAbs(s.opponent.tectonicShiftNextStepTick),
    },
  };
}

interface WhatIfStats {
  packets: number;
  bytes: number;
  skippedNoChange: number;
  metaFireCount: number;
}

/** Parallel delta stream mirroring MatchPacketSync cadence under the stabilized encoding. */
function runWhatIfStream(
  gameState: GameState,
  runtimeId: string,
  stats: WhatIfStats,
  state: { sinceEmit: number; baseline: SeatWireSnapshot | null },
  stripIds: boolean,
): void {
  state.sinceEmit += 1;
  const interval = NETCAST_EVERY_N_TICKS;
  const keyframeDue = gameState.tick > 0 && gameState.tick % KEYFRAME_INTERVAL_TICKS === 0;
  if (!keyframeDue && state.sinceEmit < interval) return;
  state.sinceEmit = 0;
  const snapshot = buildSeatWireSnapshot(gameState, runtimeId);
  if (!snapshot) return;
  if (keyframeDue || state.baseline === null) {
    // Keyframes exist in both variants; approximate their cost as measured.
    stats.packets += 1;
    stats.bytes += stripIds ? 904 - 2 * (ID_A.length + 1) : 904;
    state.baseline = cloneSeatSnapshot(stabilizeSnapshot(snapshot, stripIds));
    return;
  }
  const stabilized = stabilizeSnapshot(snapshot, stripIds);
  const delta = encodeDeltaPacket(stabilized, state.baseline, 1, 1);
  if (delta === null) {
    stats.skippedNoChange += 1;
    return;
  }
  const sections = new DataView(delta).getUint16(14, true);
  if ((sections & (1 << 3)) !== 0 || (sections & (1 << 6)) !== 0) stats.metaFireCount += 1;
  stats.packets += 1;
  stats.bytes += delta.byteLength;
  state.baseline = cloneSeatSnapshot(stabilized);
}

const results = SEEDS.map(runSeed);

let totalTicks = 0;
const kindStats = new Map<string, { count: number; bytes: number }>();
const sectionFires = new Map<string, number>();
let deltaCount = 0;
let totalBytesAllSeats = 0;
let eventBytesAllSeats = 0;

for (const r of results) {
  totalTicks += r.ticksPlayed;
  for (const seat of Object.values(r.seats)) {
    for (const p of seat.packets) {
      const name = KIND_NAMES[p.kind] ?? String(p.kind);
      const stat = kindStats.get(name) ?? { count: 0, bytes: 0 };
      stat.count += 1;
      stat.bytes += p.bytes;
      kindStats.set(name, stat);
      totalBytesAllSeats += p.bytes;
      if (p.kind === PACKET_KIND_DELTA) {
        deltaCount += 1;
        for (const [bit, name2] of SECTION_BITS) {
          if (p.sections & bit) sectionFires.set(name2, (sectionFires.get(name2) ?? 0) + 1);
        }
      }
    }
    eventBytesAllSeats += seat.eventJsonBytes;
  }
}

const simSeconds = totalTicks * tickSeconds();
const seatsTotal = results.length * 2;
const bpsPerSeat = totalBytesAllSeats / simSeconds;
const eventBpsPerSeat = eventBytesAllSeats / simSeconds;

console.log(`seeds=${SEEDS.join(',')} ticksTotal=${totalTicks} simSeconds=${simSeconds.toFixed(0)} netcastEveryNTicks=${NETCAST_EVERY_N_TICKS}`);
console.log('');
console.log('=== Per-seat averages (egress side) ===');
console.log(`packets:            ${bpsPerSeat.toFixed(0)} B/s (${(bpsPerSeat / 1024).toFixed(2)} KB/s)`);
console.log(`matchEvents (JSON): ${eventBpsPerSeat.toFixed(0)} B/s`);
console.log(`combined:           ${(bpsPerSeat + eventBpsPerSeat).toFixed(0)} B/s -> ${( ((bpsPerSeat + eventBpsPerSeat) * 3600) / 1e9 ).toFixed(3)} GB per match-hour per seat, ${( (((bpsPerSeat + eventBpsPerSeat) * 3600 * 2) / 1e9) ).toFixed(3)} GB/hour for both seats`);
console.log(`Railway egress $/match-hour @ $0.05/GB: ${((((bpsPerSeat + eventBpsPerSeat) * 3600 * 2) / 1e9) * 50).toFixed(4)}`);
console.log('');
console.log('=== Packet mix (both seats combined) ===');
for (const [name, stat] of [...kindStats.entries()].sort((a, b) => b.bytes - a.bytes)) {
  console.log(
    `${name.padEnd(18)} n=${String(stat.count).padStart(6)} avg=${(stat.bytes / stat.count).toFixed(0).padStart(5)}B total=${(stat.bytes / 1024).toFixed(0)}KB share=${((stat.bytes / totalBytesAllSeats) * 100).toFixed(1)}%`,
  );
}
console.log('');
console.log('=== Delta section fire rate (share of deltas carrying the section) ===');
for (const [, name] of SECTION_BITS) {
  const fires = sectionFires.get(name) ?? 0;
  console.log(`${name.padEnd(12)} ${(deltaCount ? (fires / deltaCount) * 100 : 0).toFixed(1)}%`);
}

let whatIfBytes = 0;
let whatIfMetaFires = 0;
let whatIfSkips = 0;
let whatIfIdsKeptBytes = 0;
let whatIfIdsKeptMetaFires = 0;
for (const r of results) {
  for (const stats of Object.values(r.whatIf)) {
    whatIfBytes += stats.bytes;
    whatIfMetaFires += stats.metaFireCount;
    whatIfSkips += stats.skippedNoChange;
  }
  for (const stats of Object.values(r.whatIfIdsKept)) {
    whatIfIdsKeptBytes += stats.bytes;
    whatIfIdsKeptMetaFires += stats.metaFireCount;
  }
}
const whatIfBpsPerSeat = whatIfBytes / simSeconds;
const whatIfIdsKeptBpsPerSeat = whatIfIdsKeptBytes / simSeconds;
const currentPacketBpsPerSeat = totalBytesAllSeats / simSeconds;
console.log('');
console.log('=== What-if variants (packet stream only, per seat) ===');
console.log(`current:                          ${currentPacketBpsPerSeat.toFixed(0)} B/s`);
console.log(`A) absolute ticks, ids kept:      ${whatIfIdsKeptBpsPerSeat.toFixed(0)} B/s (${(((currentPacketBpsPerSeat - whatIfIdsKeptBpsPerSeat) / currentPacketBpsPerSeat) * 100).toFixed(1)}% less), meta fired ${whatIfIdsKeptMetaFires}/${deltaCount} deltas`);
console.log(`B) absolute ticks + no id bytes:  ${whatIfBpsPerSeat.toFixed(0)} B/s (${(((currentPacketBpsPerSeat - whatIfBpsPerSeat) / currentPacketBpsPerSeat) * 100).toFixed(1)}% less), meta fired ${whatIfMetaFires}/${deltaCount} deltas, fully-silent opportunities: ${whatIfSkips}`);
