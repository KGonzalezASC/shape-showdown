# Phase 7: Add staging authoring and publication export

[Back to overview](overview.md)

## Goal

Let the developer author and preview levels in staging without turning staging storage into the production source of truth.

## Changes

- Add `src/internal/puzzle-author/PuzzleAuthorScreen.tsx` behind an internal build and authenticated same-origin staging route.
- Add `server/puzzle/authoring/puzzleAuthoringRouter.ts` to parse drafts and return validation errors. Do not expose this router in production.
- Add `server/puzzle/authoring/puzzleSourceExport.ts` to produce canonical source that a developer downloads and commits for review.

The staging Railway service serves the internal authoring page and API from one origin. The developer enters a high-entropy author key that exists only in a staging secret. The server exchanges it for a short-lived, HttpOnly, Secure, SameSite=Strict session cookie after a rate-limited, timing-safe comparison. The key never enters a build or persistent browser storage.

The first authoring version stores drafts in browser local storage and supports explicit export. This avoids a new database and preserves staging isolation. Add a staging-only draft store later only if cross-device drafts become a real need.

Publishing remains a repository action. The authoring tool does not write into production Pages, production object storage, or the production branch.

## Data structures

- `PuzzleDraftV1` allows incomplete authoring state and carries field-level diagnostics.
- `PuzzleSourceV1` is complete canonical source accepted by the publication generator.
- `PuzzleDraftDiagnostic` names a path, code, and plain-language message.
- `PuzzleAuthorSession` is a short-lived staging-only server session with no production identity or data access.

## Verification

Static evidence:

- Confirm that the production client build excludes the internal authoring route.
- Confirm that the production server does not register the authoring router.

Runtime evidence:

- Create, save, reload, preview, export, and re-import one draft in staging.
- Attempt the authoring route without developer authentication, with an invalid key, and with an expired session. Confirm rejection and rate limiting.
- Promote the exported source through the normal repository review path and reproduce the same `contentHash` locally.
