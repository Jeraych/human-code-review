# Play polish and one-click Study verification

Verified locally on 15 October 2026 (Pacific/Auckland), from private repository baseline `63aece7`. The user confirmed that the research Study is completed. This task changes the V2 interface and exploratory Play only; it does not reinterpret that completed research.

## Changes

- Formal A / Equal / B saves and advances in one click; Calibration saves/reveals then waits for discussion and Next. Submit and Undo were removed from the V2 interface. Legacy pending answers can continue. The underlying protocol, historical Undo records, recovery controls, frozen assignments and exports remain supported unchanged.
- A synchronous vote lock, repeated-key suppression and short activation guard prevent accidental repeats. A failed save holds the same comparison, choice, timestamp and response ID for retry. Hosted writes require acknowledgment; checked local reviewer writes must succeed. Dirty hosted backups survive refresh; server acknowledgments lost in transit reconcile without adding a second answer. Results wait for confirmed persistence.
- Curated Play has 883 comparisons instead of 1,292. Removed five invisible-equal pairs and 404 repeated visible comparisons within a task/contrast. Comments, naming, indentation, internal blank lines and structural differences remain meaningful. No AST or numeric similarity filter is used. Full counts and representative IDs are in [PLAY_POOL_AUDIT.md](PLAY_POOL_AUDIT.md).
- Seen pairs are excluded throughout a session and refresh. A 12-round recent window prefers fresh tasks and code, relaxing oldest entries when availability requires it. The least-used available contrast is preferred, and independent random bits set A/B orientation. Returning visits preserve recent avoidance; exhausted playlists offer an explicit replay.
- Community proportions appear only after voting: current pair sample size, A / Equal / B with the player's choice, plus optional totals by contrast. Empty, loading, error and small-sample states are explicit. Counts represent anonymous votes, not distinct people or representative research.
- The public endpoint exposes aggregates from the existing SQLite Play table only. It verifies current catalog/version and actual output/condition mappings, accepts compatible frozen legacy V2 rows, excludes non-Play/malformed/version-mismatched records, and never exposes raw visitors, answers, credentials or Study records. Response IDs remain idempotent. Opt-out persists; opted-out choices are excluded. Existing opted-in pending votes can still retry.
- Responsive proportion bars and a compact non-sticky reveal preserve code viewing, text selection, scrolling, native keyboard controls and the Next/N loop. No packages, frameworks, model outputs, database migrations or accounts were added.

## Fresh checks

| Check | Result |
|---|---|
| `npm.cmd test` | 86 tests passed (78 existing + 8 focused regressions) |
| Python unittest discovery | 7 passed, including historical JSON/CSV merge/download checks |
| `npm.cmd run build` | Passed TypeScript and production build |
| `scripts/pilot_play_polish.mjs` | 37 browser/API checks passed |
| Updated `scripts/pilot_v2_guided.mjs` | 57 checks passed |
| Unchanged `scripts/pilot_v2_integration.mjs` | 14 checks passed |
| Browser runtime errors | None in these suites |
| Frozen `public/` and `researcher/` assets | All 14 SHA-256 hashes unchanged |
| Operational SQLite, WAL and SHM | All three SHA-256 hashes unchanged |
| Research core diff | Empty for `v2.ts`, `v2Transfer.ts`, V1 export/session/storage and frozen data |
| `git diff --check` | Passed |

The new browser/API checks cover reversal, Equal, version filtering, duplicate/conflicting IDs, public privacy, opt-out, hidden pre-vote statistics, successful/error/empty statistics, refresh, double activation, held keyboard input, 503 saves, lost acknowledgments, complete Joint/Independent reviews, offline reviewer files, local quota failure/retry, preserved completed fixture exports/agreement, text selection, code scrolling and exhaustion/replay. Existing guided checks also cover imports, archived history, configuration immutability, reset confirmation, cross-device synchronization and service restart. Integration checks cover `/demo/`, dev/preview, legacy recovery, SQLite restart persistence and hidden Windows launch behavior.

All browser sessions and API votes use unique ignored QA databases. Synthetic fixture votes shown below exist only in those isolated databases; they were never mixed into operational community statistics. The operational Study database was not opened by a test service or queried for its answers. Historical result protection is supported by byte-identical protected files/database files, unchanged research analysis/export code and completed-fixture regressions; actual participant answers were not reanalysed.

## Browser evidence

Chrome desktop at 1440×1000 and Chromium phone emulation at 390×844; both have no horizontal page overflow. Existing integration also verified subdirectory mobile hosting. Screenshots are local ignored artifacts, not production statistics:

- [Desktop Play and community bars](qa/play-polish/play-community-desktop.png)
- [Mobile Play and community bars](qa/play-polish/play-community-mobile.png)
- New checks: `qa/play-polish/checks.json`
- Guided checks: `qa/v2/guided-verification.json`
- Hosting checks: `qa/v2/integration-verification.json`

## Integrity findings and limits

The audit found no exact-identical Formal-eligible pair. Five Formal-eligible pairs differ only in invisible whitespace; their IDs are listed separately in the pool audit. This is a pool-quality finding, not evidence that any of those pairs appeared in the completed assignments. Repeated tasks/code follow the canonical matched contrasts and ordinals. Completed Formal sampling, responses and agreement were not changed.

Physical iOS/Android, screen readers, live Railway configuration/TLS/volumes, production community sample sizes and remote deployment are unverified. Vite's existing large-chunk warning and Node's experimental SQLite warning remain; no dependency upgrade or architecture expansion was performed. Aggregate reads scan compatible stored Play records, appropriate to the existing small single-service architecture; no large-scale load claim is made. When browser storage is unavailable, current-tab Play still works but history cannot survive browser closure; a failed Study local write must be retried before continuing.

## Files and deployment

Implementation: `src/V2App.tsx`, `src/playV2.ts`, `src/components/Community.tsx`, `src/v2.css`, `server/api.ts`. Verification/audit: `tests/play-v2.test.ts`, `scripts/audit_play.mjs`, `scripts/pilot_play_polish.mjs`, updated `scripts/pilot_v2_guided.mjs`. Documentation: `README.md`, `PLAY_POOL_AUDIT.md`, this report.

Git origin was freshly fetched and matched local baseline `63aece7` before changes. No tracked Railway, Docker, Nixpacks, Vercel or GitHub workflow configuration was found. Provider-side automatic deployment settings were not inspected. **No push, remote deployment, Railway volume reset or production write was performed.** The update is a local commit; its SHA is provided in the chat handoff. The pre-existing untracked `CHATGPT_HANDOFF.md` was left untouched.
