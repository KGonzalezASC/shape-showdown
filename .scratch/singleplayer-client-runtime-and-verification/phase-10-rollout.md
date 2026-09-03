# Phase 10: Roll out, observe, and retire the legacy path

[Back to overview](overview.md)

## Goal

Release the client-run path with a measured compatibility window, then close the production socket path.

## Changes

- Add a release flag that selects the local puzzle runtime in staging first, then production.
- Keep the old production puzzle socket available only for one measured compatibility window after the local client ships.
- Remove the legacy production puzzle host only after the user explicitly approves the related specification and test retirement.

Release the static pack before the client that requires it. Keep the prior pack addressable through the compatibility window. Never replace bytes at an existing content-addressed URL.

Measure the deployed `index.html` cache policy. Define the compatibility window as that observed cache lifetime plus the maximum puzzle duration. During the window, new clients use only the local runtime and never fall back to Railway. Old cached clients may finish through the legacy host. After the window, Phase 6 closes the production socket path. Any client older than the window receives an explicit update-required error instead of a silent loading state.

## Data structures

- `PuzzleClientRuntimePolicy` selects `local` or temporary `legacy-development` behavior.
- `PublishedPuzzleManifestV1.releaseId` identifies the deployed content set.

## Verification

Static evidence:

- Inspect the production build, server configuration, and generated manifest at the exact release commit.
- Confirm that all legacy compatibility flags default closed in production after the measured window.

Runtime evidence:

- Deploy the pack and verify its hash before deploying the client.
- Measure the real `index.html` cache policy, record the compatibility deadline, and observe legacy puzzle handshakes during the window.
- Exercise direct web and Discord Activity puzzles against production Pages.
- Keep the Railway game service unavailable during one casual puzzle proof.
- Inspect Railway logs and metrics. A casual puzzle must create no socket, session, timer, API request, or egress from Railway.
- If ranked verification ships, show its replay as a separate short request and account for its CPU, memory, and egress independently.
