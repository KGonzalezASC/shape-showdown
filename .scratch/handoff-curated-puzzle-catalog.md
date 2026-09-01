# Handoff — Curated puzzle catalog (after RulesBot baseline contract)

## Status of the previous pass

The RulesBot candidate-batch / Reference Baseline contract on `feature/single-player-puzzles` is **done**. Treat that work as closed.

Landed commits (newest first):

- `de2e6cb` docs: Candidate Profile, Benchmark Policy, Validation Artifact in `CONTEXT.md`; `validate:puzzles` in `AGENTS.md` (may still need push if the branch was ahead)
- `29eac94` validation artifact emitter + `bun run validate:puzzles` → `fixtures/puzzle-validation/`
- `d2451b9` deterministic baseline batch runner + comparator
- `cc459c9` versioned `RulesBotCandidateProfile`
- `ca666e8` authoritative engine `score` on attempt/report/solution + typed benchmark policy
- `c722cc4` earlier checkpoint (broader single-player WIP; not the baseline contract itself)

Closed external handoff (superseded): Temp `shape-showdown-rulesbot-baseline-handoff-2026-08-31.md`.

Do **not** drive the next session from `.scratch/handoff-puzzle-mode.md`. That file is an earlier prototype handoff (client route + socket host). It remains historical only.

## Next-session focus

Replace inline `generatePuzzleLevel(...)` staging puzzles in `scripts/validate-puzzle-baselines.mts` with a **small curated catalog** checked into the repo: immutable puzzle definitions that `validate:puzzles` loads, validates, and writes artifacts for.

Goal: the content/baseline pipeline reads real authored (or generator-exported then frozen) levels, not ad-hoc script literals.

## Read first

1. `CONTEXT.md` — Curated Puzzle Library terms (including Validation Artifact, RulesBot Candidate Profile, Puzzle Benchmark Policy, Reference Baseline).
2. `AGENTS.md` — `bun run validate:puzzles` and the curated-puzzle verification row.
3. `server/puzzle/puzzleTypes.ts`, `puzzleValidationArtifact.ts`, `puzzleBaselineBatch.ts`.
4. `fixtures/puzzle-validation/` — current emitted artifacts (shape to preserve).
5. Runtime code and tests remain source of truth when docs disagree.

## In scope

1. **Catalog seam** under something like `server/puzzle/catalog/` or `fixtures/puzzles/` (prefer a clear server-owned load path that never ships RulesBot into the client bundle).
2. Each catalog entry is a frozen `PuzzleLevel` (or a loader that builds one deterministically from frozen inputs) with:
   - explicit `benchmark` (do not rely on default forever for curated content)
   - explicit `allowHold` / `shopPolicy`
   - scripted timeline as part of content identity
3. Add **`visibilityPolicy`** onto the level type (or a catalog wrapper) so validation artifacts stop recording only `unspecified`. Keep it a presentation field, not a security boundary (`CONTEXT.md`).
4. Point `scripts/validate-puzzle-baselines.mts` at the catalog. Re-emit `fixtures/puzzle-validation/`.
5. Focused tests: catalog load determinism, contentHash stability, validate script exit on failed/invalid-batch.
6. Optional thin seam: store `intendedSolutionRefs` / `solutionAlternativeRefs` as string ids on catalog entries (still **no** hidden command traces in the player-facing bundle or artifact).

## Out of scope (do not start in this pass)

- Client puzzle UI, landing button, or lazy client runtime
- Removing or replacing `PuzzleHost` / live Socket.IO solo sessions
- Daily challenge calendar selection
- Online end-of-attempt verifier
- Broad RulesBot heuristic redesign or `Math.random` variation
- Unrelated recording/storage WIP

## Acceptance criteria

- `bun run validate:puzzles` loads puzzles from the catalog, not hardcoded generator calls in the script body.
- Every curated level declares benchmark + visibility policy.
- Same catalog content → same `contentHash` and identical artifact metrics for the same candidate list and engine/protocol version.
- `bun test server/puzzle/` and `bun run lint` pass.
- RulesBot remains server/testHarness-only; catalog + fixtures stay out of the production client bundle.
- Commit only catalog/validation files on `feature/single-player-puzzles`.

## Suggested verification

```bash
bun test server/puzzle/
bun run validate:puzzles
bun run lint
git diff --check
git status --short
```

## Suggested skills

- `implement`
- `principle-model-the-domain`
- `principle-prove-it-works`
- `use-bun`
