import {
  applyDeltaPacket,
  applyTectonicMovesToBoard,
  cloneSeatSnapshot,
  decodeKeyframePacket,
  decodeTectonicCompletePacket,
  decodeTectonicStepPacket,
  PacketDecodeError,
} from './decodeMatchPacket.js';
import { readPacketHeader } from './encodeMatchPacket.js';
import { toArrayBuffer } from './binary.js';
import { seatSnapshotToClientModel } from './clientMatchModel.js';
import type { ClientMatchModel, DecodedSeatSnapshot } from './wireTypes.js';
import {
  GAME_PROTOCOL_VERSION,
  PACKET_KIND_DELTA,
  PACKET_KIND_KEYFRAME,
  PACKET_KIND_TECTONIC_COMPLETE,
  PACKET_KIND_TECTONIC_STEP,
} from './version.js';

export type ClientPacketDecoderState =
  | { kind: 'awaiting-keyframe' }
  | {
      kind: 'ready';
      generation: number;
      expectedSequence: number;
      snapshot: DecodedSeatSnapshot;
    };

export class ClientPacketDecoder {
  private state: ClientPacketDecoderState = { kind: 'awaiting-keyframe' };
  private myId: string | null = null;
  private needsKeyframe = false;
  private lastKeyframeRequestAt = 0;

  setMyId(id: string | null): void {
    this.myId = id;
  }

  reset(): void {
    this.state = { kind: 'awaiting-keyframe' };
    this.needsKeyframe = false;
  }

  shouldRequestKeyframe(): boolean {
    return this.needsKeyframe;
  }

  consumeKeyframeRequest(): void {
    this.needsKeyframe = false;
  }

  markKeyframeNeeded(): void {
    const now = Date.now();
    if (now - this.lastKeyframeRequestAt < 500) return;
    this.lastKeyframeRequestAt = now;
    this.needsKeyframe = true;
    this.state = { kind: 'awaiting-keyframe' };
  }

  decode(buffer: ArrayBuffer | ArrayBufferView): ClientMatchModel | null {
    try {
      const packet = toArrayBuffer(buffer);
      const header = readPacketHeader(packet);
      if (header.version !== GAME_PROTOCOL_VERSION) {
        this.markKeyframeNeeded();
        return null;
      }

      if (header.kind === PACKET_KIND_KEYFRAME) {
        const snapshot = decodeKeyframePacket(packet);
        this.state = {
          kind: 'ready',
          generation: header.baseGeneration,
          expectedSequence: header.sequence,
          snapshot: cloneSeatSnapshot(snapshot),
        };
        this.needsKeyframe = false;
        return seatSnapshotToClientModel(snapshot, this.myId);
      }

      if (this.state.kind !== 'ready') {
        this.markKeyframeNeeded();
        return null;
      }

      if (header.sequence !== ((this.state.expectedSequence + 1) >>> 0)) {
        this.markKeyframeNeeded();
        return null;
      }

      if (header.kind === PACKET_KIND_DELTA) {
        if (header.baseGeneration !== this.state.generation) {
          this.markKeyframeNeeded();
          return null;
        }
        const snapshot = applyDeltaPacket(this.state.snapshot, packet);
        this.state = {
          kind: 'ready',
          generation: (header.baseGeneration + 1) >>> 0,
          expectedSequence: header.sequence,
          snapshot: cloneSeatSnapshot(snapshot),
        };
        return seatSnapshotToClientModel(snapshot, this.myId);
      }

      if (header.kind === PACKET_KIND_TECTONIC_STEP) {
        const step = decodeTectonicStepPacket(packet);
        if (this.state.kind !== 'ready') {
          this.markKeyframeNeeded();
          return null;
        }
        const snapshot = cloneSeatSnapshot(this.state.snapshot);
        snapshot.tick = step.tick;
        const target = step.playerId === snapshot.local.id ? snapshot.local : snapshot.opponent;
        if (step.playerId === snapshot.local.id) {
          applyTectonicMovesToBoard(snapshot.local.board, snapshot.local.poisonBoard, step.moves);
        } else {
          applyTectonicMovesToBoard(snapshot.opponent.board, [], step.moves);
        }
        if (target.tectonicShiftNextStepTick !== null && target.tectonicShiftNextStepTick !== undefined) {
          target.tectonicShiftNextStepTick = Math.max(0, (target.tectonicShiftNextStepTick ?? 0) - 1);
        }
        this.state = {
          kind: 'ready',
          generation: this.state.generation,
          expectedSequence: header.sequence,
          snapshot,
        };
        return seatSnapshotToClientModel(snapshot, this.myId);
      }

      if (header.kind === PACKET_KIND_TECTONIC_COMPLETE) {
        decodeTectonicCompletePacket(packet);
        this.markKeyframeNeeded();
        return null;
      }

      this.markKeyframeNeeded();
      return null;
    } catch (error) {
      if (error instanceof PacketDecodeError) {
        this.markKeyframeNeeded();
        return null;
      }
      throw error;
    }
  }
}
