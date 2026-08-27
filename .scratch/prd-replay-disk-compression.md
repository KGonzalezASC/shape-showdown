# Spec: Replay disk compression

## Problem Statement

The 5-second snapshot pass cut live match RAM. It did not change how a finished replay hits disk. The server still writes uncompressed UTF-8 JSON. Anyone who copies that file off Railway, keeps fixtures, or later stores replays in object storage still pays for the fat text.

Gzip of the same JSON is about 99% smaller. That work happens after the match ends. It does not touch the 60 Hz loop, live `gamePacket`s, or `activeReplay` RAM.

This is still worth doing. It is no longer the match-memory fix. It is the disk and download fix.

## Solution

At match end, compress the JSON with gzip level 9, then write the bytes to the same `.replay` name. Readers sniff the file. Gzip magic `1f 8b` decompresses, then parses JSON. A file that starts with `{` parses as today's UTF-8. Existing fixtures and old downloads keep working.

The replay viewer file picker and any URL load that points at a `.replay` file use the same decode. Demo `.json` files under fixtures stay plain JSON.

## User Stories

1. As the person paying Railway disk or later object storage, I want new `.replay` files gzipped, so a finished match is kilobytes on disk instead of hundreds of kilobytes of JSON.
2. As someone downloading a replay, I want the file already small, so egress is the compressed size, not the UTF-8 size.
3. As someone opening an old uncompressed `.replay` in the viewer, I want it to load, so I do not have to convert archives.
4. As someone opening a new gzip `.replay` in the viewer, I want it to load from the file picker, so I do not need a separate unzip step.
5. As someone opening a demo `.json` from the viewer URL, I want that path to stay `res.json()`, so current demo files do not need a binary fetch.
6. As a developer writing GameManager tests, I want a round-trip helper that reads whatever `saveReplay` wrote, so tests do not assume UTF-8 forever.
7. As a developer running the 60 Hz loop, I want compression to run on the existing async write path after stringify, so gzip CPU cannot stall a tick.
8. As a developer when `REPLAYS_DIR` is unset, I want no write and no gzip, so disabled capture stays disabled.
9. As a developer inspecting a bot pair evidence `.json`, I want those files to stay uncompressed text, so git diffs and `jq` still work.
10. As a developer who gzip-peeks a `.replay` with ordinary tools, I want standard gzip bytes, so `gzip -d` works after a rename or stdin.
11. As a developer comparing Brotli vs gzip, I want one codec in this pass, so we do not ship two writers and a guessing reader.
12. As a developer loading a corrupt file, I want a clear invalid-replay error, not a hang or a silent empty board.
13. As a developer keeping historical interval-1 fixtures, I want those UTF-8 files left as they are, so this change does not rewrite 3 GB of fixtures.
14. As a developer later putting replays in R2, I want the on-disk format already compressed, so the storage adapter does not invent a second encoding.

## Implementation Decisions

- Codec is gzip level 9. Measured on this repo, gzip-9 turned a 984 KB interval-30 file into 11 KB and a 41 MB interval-1 file into 353 KB. Brotli was smaller still. Gzip is enough after 300-tick snapshots, and the browser can decode it with `DecompressionStream('gzip')`. One codec.
- File name stays `replay_<date>.replay`. Do not add `.gz`. Sniff the first two bytes. `1f 8b` means gzip. `{` or a UTF-8 BOM means legacy JSON.
- The seam is one encode and one decode for "replay bytes on disk" to `ReplayData`. `saveReplay` encodes, then `Bun.write`s the bytes. Tests and the viewer decode. Do not copy sniff logic into GameManager and the viewer separately.
- Encode is `JSON.stringify`, then gzip-9. Decode is sniff, optional gunzip, then `JSON.parse`, then the existing v2 normalize. Invalid gzip or invalid JSON is a failed load, not a fallback that eats the file as text.
- Compression runs on the existing async save path, after the match has ended and after `activeReplay` is released from the manager. Do not gzip on the simulation tick. Do not keep a second uncompressed copy in RAM after the write starts.
- `REPLAYS_DIR` unset, `none`, or `disabled` still skips the write. No encode.
- Viewer file input reads `ArrayBuffer`, not `readAsText`. URL loads of `.json` demos stay JSON. URL loads of `.replay` use the decode seam so a gzip file served from fixtures still opens.
- Harness generators that write `.json` evidence stay uncompressed. This spec only changes GameManager `.replay` capture and the shared reader.
- Do not batch-convert `fixtures/replays/*.replay`. New writes are gzip. Old writes remain UTF-8. The reader accepts both.
- Do not compress `activeReplay` while the match runs. Sparse 300-tick snapshots already own that RAM problem.
- Do not compress live `gamePacket`s, Postgres checkpoints, or Socket.IO payloads in this pass.

## Testing Decisions

A good test checks bytes on disk and a successful round trip to the same `ReplayData` object. It does not assert a compression ratio.

- Encode then decode of a small v2 replay equals the original object. The encoded bytes start with gzip magic and are smaller than the UTF-8 JSON.
- Decode of a UTF-8 JSON buffer that starts with `{` still returns the object. Legacy files keep working.
- Decode of truncated gzip or random bytes fails. No parsed half-object.
- GameManager save with `REPLAYS_DIR` set writes a file the decode helper can read, including the terminal top-out event. Stop using `JSON.parse(fs.readFileSync(..., 'utf8'))` on that path.
- GameManager with `REPLAYS_DIR` unset still writes nothing.
- Prior art. The GameManager test that already writes `replay_terminal-tick-test.replay` and reads it back. Point that read at the decode helper. Add unit tests next to the encode/decode seam. Do not require a browser test to prove gzip magic. Viewer file-picker gzip can be a small decode-on-ArrayBuffer test if the helper is isomorphic, or a manual check listed in Further Notes.

## Out of Scope

- Brotli, zstd, or a format flag in the JSON body.
- Rewriting historical fixtures to gzip.
- Compressing bot generator `.json` evidence.
- Streaming gzip of `activeReplay` during the match.
- Changing snapshot cadence, RNG-on-keyframe, or `replayToTick`.
- Durable object-storage upload. This spec only makes the local file small enough that a later upload is cheap.
- Live match netcast compression.

## Further Notes

Sparse 300-tick snapshots already dropped a 5-minute capture from about 5 MB of JSON to about 0.5 MB plus the input tape. Gzip still matters because that JSON is extremely repetitive. Empty rows, shared keys, and cloned shop maps shrink far more than the snapshot cadence alone.

This work does not reduce Railway RAM during play. If `REPLAYS_DIR` is disabled in production, gzip never runs. Turn capture on, or this spec only helps local and staging files.

Do not pick Brotli in this pass to chase the last 50% of an already tiny file. Revisit only if a later storage bill shows gzip is the line item.
