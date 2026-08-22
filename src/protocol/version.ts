/** Shared gameplay transport protocol version (client + server). */
export const GAME_PROTOCOL_VERSION = 3;

export const PACKET_KIND_KEYFRAME = 1;
export const PACKET_KIND_DELTA = 2;
export const PACKET_KIND_TECTONIC_STEP = 3;
export const PACKET_KIND_TECTONIC_COMPLETE = 4;

/** Full keyframe every 120 simulation ticks (2s @ 60 Hz). */
export const KEYFRAME_INTERVAL_TICKS = 120;

/** Hard cap for a single gameplay packet payload. */
export const MAX_PACKET_BYTES = 64 * 1024;

export const PACKET_HEADER_BYTES = 14;
