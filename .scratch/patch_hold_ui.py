# -*- coding: utf-8 -*-
from pathlib import Path

EM = "\u2014"

gf = Path("src/components/GameField.tsx")
text = gf.read_text(encoding="utf-8")
orig = text

# 1) Add allowHold prop
old_props = """  /** Match chrome: guest/display name row. Hide for solo puzzles. */
  showPlayerName?: boolean;
  /** Current replay tick used to show remaining effect duration. */
  effectTick?: number;"""

new_props = """  /** Match chrome: guest/display name row. Hide for solo puzzles. */
  showPlayerName?: boolean;
  /**
   * When false (solo puzzles like Four Wide), storage is disabled entirely.
   * Distinct from multiplayer `canHold === false` ("Used this piece").
   * Default / undefined = enabled.
   */
  allowHold?: boolean;
  /** Current replay tick used to show remaining effect duration. */
  effectTick?: number;"""

if old_props not in text:
    raise SystemExit("FAIL: props block")
text = text.replace(old_props, new_props, 1)

# 2) Destructure with default true
old_d = """  showFunds = true,
  showPlayerName = true,
  effectTick,
  replayCandidateOverlay = null,
}, ref) => {"""

new_d = """  showFunds = true,
  showPlayerName = true,
  allowHold = true,
  effectTick,
  replayCandidateOverlay = null,
}, ref) => {"""

if old_d not in text:
    raise SystemExit("FAIL: destructure")
text = text.replace(old_d, new_d, 1)

# 3) Early storageDisabled + swapZoneText + holdStatus
old_block = f"""  const holdPreviewCell = Math.max(5, Math.round(cellSize * 0.31));
  const swapZoneText = `Swap rows 0-${{cutoffRow - 1}}`;
  const swapLineY = cutoffRow * cellSize;
  const showSwapLine = isMe && cutoffRow > 0 && cutoffRow < BOARD_VISIBLE_ROWS;

  const storageFrozen = isMe && activeEffects.some((e) => e.kind === 'freeze');
  const snagged = isMe && !!player.snagHardDropBlocked;
  const holdPoisoned = !!player.activePiece?.poisoned;
  const holdStatus = storageFrozen
    ? {{ text: 'Frozen {EM} no store/swap', tone: 'text-sky-300' }}
    : holdPoisoned
      ? {{ text: 'Poisoned {EM} no hold', tone: 'text-fuchsia-300' }}
      : snagged
        ? {{ text: 'Snagged {EM} no hard drop', tone: 'text-orange-300' }}
        : !player.activePiece
          ? {{ text: 'No active piece', tone: 'text-zinc-300' }}
          : !player.canHold
            ? {{ text: 'Used this piece', tone: 'text-amber-300' }}
            : !canHoldByHeight
              ? {{ text: 'Past swap line', tone: 'text-rose-300' }}
              : {{ text: 'Ready', tone: 'text-emerald-300' }};"""

new_block = f"""  const holdPreviewCell = Math.max(5, Math.round(cellSize * 0.31));
  const storageDisabled = allowHold === false;
  const swapZoneText = storageDisabled
    ? 'Hold unavailable'
    : `Swap rows 0-${{cutoffRow - 1}}`;
  const swapLineY = cutoffRow * cellSize;
  const showSwapLine = isMe && !storageDisabled && cutoffRow > 0 && cutoffRow < BOARD_VISIBLE_ROWS;

  const storageFrozen = isMe && activeEffects.some((e) => e.kind === 'freeze');
  const snagged = isMe && !!player.snagHardDropBlocked;
  const holdPoisoned = !!player.activePiece?.poisoned;
  const holdStatus = storageDisabled
    ? {{ text: 'Storage disabled', tone: 'text-rose-400' }}
    : storageFrozen
      ? {{ text: 'Frozen {EM} no store/swap', tone: 'text-sky-300' }}
      : holdPoisoned
        ? {{ text: 'Poisoned {EM} no hold', tone: 'text-fuchsia-300' }}
        : snagged
          ? {{ text: 'Snagged {EM} no hard drop', tone: 'text-orange-300' }}
          : !player.activePiece
            ? {{ text: 'No active piece', tone: 'text-zinc-300' }}
            : !player.canHold
              ? {{ text: 'Used this piece', tone: 'text-amber-300' }}
              : !canHoldByHeight
                ? {{ text: 'Past swap line', tone: 'text-rose-300' }}
                : {{ text: 'Ready', tone: 'text-emerald-300' }};"""

if old_block not in text:
    raise SystemExit("FAIL: holdStatus block")
text = text.replace(old_block, new_block, 1)

# 4) Empty storage slot: big red X when disabled
old_empty = """            ) : (
              <div
                className="flex items-center justify-center border border-dashed border-zinc-700 text-[10px] font-mono text-zinc-500"
                style={{ width: HOLD_PREVIEW_SIZE * holdPreviewCell, height: HOLD_PREVIEW_SIZE * holdPreviewCell }}
              >
                EMPTY
              </div>
            )}"""

new_empty = """            ) : (
              <div
                className={`relative flex items-center justify-center border border-dashed text-[10px] font-mono ${
                  storageDisabled
                    ? 'border-rose-500/50 bg-rose-950/40 text-rose-400'
                    : 'border-zinc-700 text-zinc-500'
                }`}
                style={{ width: HOLD_PREVIEW_SIZE * holdPreviewCell, height: HOLD_PREVIEW_SIZE * holdPreviewCell }}
                aria-label={storageDisabled ? 'Storage disabled' : 'Empty storage'}
              >
                {storageDisabled ? (
                  <span
                    className="pointer-events-none select-none text-4xl font-black leading-none text-rose-500"
                    aria-hidden
                  >
                    {'\\u2715'}
                  </span>
                ) : (
                  'EMPTY'
                )}
              </div>
            )}"""

# Fix the unicode escape in the written source - we want literal ✕ in TSX or \u2715 in JS string
new_empty = new_empty.replace("{'\\u2715'}", "{'\\u2715'}")
# Actually in the Python string above {'\\u2715'} becomes {'\u2715'} in the file which is correct JS.
# Wait: in the raw string with @' '@ we're writing to a file. Let me use a real X character.

new_empty = """            ) : (
              <div
                className={`relative flex items-center justify-center border border-dashed text-[10px] font-mono ${
                  storageDisabled
                    ? 'border-rose-500/50 bg-rose-950/40 text-rose-400'
                    : 'border-zinc-700 text-zinc-500'
                }`}
                style={{ width: HOLD_PREVIEW_SIZE * holdPreviewCell, height: HOLD_PREVIEW_SIZE * holdPreviewCell }}
                aria-label={storageDisabled ? 'Storage disabled' : 'Empty storage'}
              >
                {storageDisabled ? (
                  <span
                    className="pointer-events-none select-none text-4xl font-black leading-none text-rose-500"
                    aria-hidden
                  >
                    \u2715
                  </span>
                ) : (
                  'EMPTY'
                )}
              </div>
            )}"""

if old_empty not in text:
    raise SystemExit("FAIL: empty slot")
text = text.replace(old_empty, new_empty, 1)

# 5) Memo compare
old_memo = """    prev.showFunds !== next.showFunds ||
    prev.showPlayerName !== next.showPlayerName
  ) {"""

new_memo = """    prev.showFunds !== next.showFunds ||
    prev.showPlayerName !== next.showPlayerName ||
    prev.allowHold !== next.allowHold
  ) {"""

if old_memo not in text:
    raise SystemExit("FAIL: memo")
text = text.replace(old_memo, new_memo, 1)

if text == orig:
    raise SystemExit("FAIL: no changes")

gf.write_text(text, encoding="utf-8", newline="\n")
print("GameField.tsx patched OK")
print("allowHold prop:", "allowHold?: boolean" in text)
print("Storage disabled:", "Storage disabled" in text)
print("memo allowHold:", "prev.allowHold !== next.allowHold" in text)
