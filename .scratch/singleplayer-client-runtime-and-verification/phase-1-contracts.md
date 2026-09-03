# Phase 1: Freeze the puzzle and attempt contracts

[Back to overview](overview.md)

## Goal

Define the immutable content and command shapes before moving runtime code. Remove the current semantic gaps from the target design so the browser does not freeze them into a public format.

## Changes

- Add `src/puzzle/publishedPuzzle.ts` with versioned player-safe types, exact command unions, canonical encoding, and boundary parsers.
- `parsePublishedPuzzleV1` enforces hash integrity asynchronously: it recomputes SHA-256 over `shape-showdown:puzzle:v1\0` + canonical payload bytes and rejects forged or mismatched `contentHash`.
- Export `parsePublishedPuzzleBaselineV1` and `parsePublishedPuzzleStructureV1` for dedicated baseline parsing and synchronous structural validation.
- Update `server/puzzle/puzzleTypes.ts` so `CuratedPuzzleContent = PublishedPuzzlePayloadV1` is the canonical target format for publication. Document that `server/puzzle/catalog/stagingEntries.ts` remains typed as `LegacyCuratedPuzzleLevel` during Phases 1-2.
- In `server/puzzle/publishedPuzzleAdapter.ts`, document that `freezeFinitePieceSequence` synthesizes a finite sequence from legacy queuePrefix + seed as an interim migration bridge for Phases 1-2. Final published content in Phase 3/7 will consume authored complete sequences directly.
- Update `CONTEXT.md` with the static publication, casual attempt, and verified attempt terms.

Use a migration adapter for existing authored levels. Do not make `queuePrefix` or `shopPolicy` part of `PublishedPuzzleV1`.

## Data structures

- `PublishedPuzzleManifestV1` indexes immutable pack files.
- `PublishedPuzzlePayloadV1` is the canonical hash input and contains only player-safe deterministic content.
- `PublishedPuzzleV1` wraps the payload with its derived `contentHash` and validation-derived public baseline metrics. The baseline is outside the hashed payload.
- `PuzzleCommandV1` is a discriminated union for a full held-input state or one allowed action.
- `PuzzleAttemptEnvelopeV1` carries an optional verification submission.
- `PuzzleVerificationVerdictV1` returns stable accept or reject reasons.

## Verification

Static evidence:

- Type-check the new discriminated unions with the repository lint command (`bun run lint`).
- Inspect imports and prove that `publishedPuzzle.ts` has no Node, Socket.IO, RulesBot, filesystem, or database dependency.

Runtime evidence:

- Parse one current authored puzzle through the migration adapter.
- Reject a puzzle with an endless piece source, an unknown timeline kind, an unsafe numeric value, or a mismatched schema version.
- Encode the same payload through two object insertion orders and prove byte and hash identity.
- Verify hash integrity: `parsePublishedPuzzleV1` accepts valid hashes and throws on tampered or forged `contentHash` (`src/puzzle/publishedPuzzle.test.ts`).

