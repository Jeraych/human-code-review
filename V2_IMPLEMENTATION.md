# Human Validation V2 implementation record

The audit started from clean `main` at `24b0ae5`; a successful remote fetch confirmed `HEAD...origin/main = 0 / 0`. V1 Study, Play, storage, export and frozen assets remain available at `/?v1=1#home`. V2 is the default application. No site has been deployed, no actual human ratings have been collected, and no model programs or training were executed.

## Architecture and persistence

The existing React/Vite app, Home and symmetric Shiki comparison panels are reused. `src/v2.ts` owns the protocol, assignments, audit rules and export semantics for both browser and server. `src/v2Storage.ts` owns checked local writes, compatible backup imports and three-way reconciliation. `src/V2App.tsx` adds the V2 flow; `src/v2.css` extends the existing design.

`server/api.ts` is a small same-origin Node 24 service using built-in SQLite, with no new runtime packages or accounts. A persistent disk holds the protocol, revision history and separate anonymous Play table. Writes use a transaction and expected revision. Independent reviewer edits reconcile; conflicting same-field edits stop without overwriting. The browser saves before attempting the network, retries pending Study progress, and supports identical backups offline. Hosted operation has been verified against the local service, including a fresh browser/device context; a real remote host has **not** been configured or verified.

## Source evidence

All five conditions exist. Base uses archived runs 33–35; C uses runs 30–32; S 33–35; J 36–38; SJ 39–41 from the real `combined_39_41_review.tar.gz`. The importer reads the archive without extracting into or editing raw experiment folders. Run 32's `_1` filenames are handled explicitly. Training simulations under `tmp/combined-39-41-offline` are never imported.

`public/v2/outputs-{B,C,S,J,SJ}.json` contains 600 real holdout outputs per condition. `public/v2/catalog.json` records all 2,400 matched slots, prompt text, opaque IDs, exact/trim-normalized duplicate flags and eligibility. `researcher/provenance-v2.json` records input hashes, configuration/health evidence and limitations. IDs are derived from source and code hashes and remain constant in both modes. Existing V1 files are untouched. The builder refuses to overwrite any changed frozen V2 asset.

| Contrast | Matched slots | Both correct | Exact identical, all slots | Exact identical, both correct | Eligible both-correct differing |
|---|---:|---:|---:|---:|---:|
| B–C | 600 | 531 | 182 (30.33%) | 177 / 531 (33.33%) | 354 |
| C–S | 600 | 513 | 139 (23.17%) | 133 / 513 (25.93%) | 380 |
| C–J | 600 | 531 | 201 (33.50%) | 199 / 531 (37.48%) | 332 |
| S–SJ | 600 | 512 | 304 (50.67%) | 286 / 512 (55.86%) | 226 |

| Condition | Correctness | Ruff clean | Correct + Ruff clean |
|---|---:|---:|---:|
| C | 545/600 = 90.8% | 394/600 = 65.7% | 358/600 = 59.7% |
| S | 526/600 = 87.7% | 565/600 = 94.2% | 495/600 = 82.5% |
| J | 542/600 = 90.3% | 454/600 = 75.7% | 410/600 = 68.3% |
| SJ | 527/600 = 87.8% | 568/600 = 94.7% | 495/600 = 82.5% |

There are no discrepancies from the requested rounded aggregate values. Matching task/seed/ordinal does not establish common RNG draws. Run 35 retains its 70/2,000 training correctness timeouts, mainly tasks 15/39, reused diagnostic timeout outcomes and unresolved original trigger. Eligibility uses the actual holdout test results. Historical checkpoint hashes and dataset revision remain unavailable.

## Workflow and research boundaries

- Calibration has 12 fixed pairs, three per contrast, shared at one computer. Choices use Submit; metadata is revealed afterward. Guideline wording can be edited and is frozen by Lock Calibration. Every calibration pair is excluded from both reviewers' Formal assignments.
- Generate / Lock Formal V2 uses fixed seed `7002026`. Tests on the real catalog confirm 20 different task IDs per contrast, a 7/7/6 seed allocation, four overlaps per contrast, 80 distinct pairs and 48 assignments per reviewer. Pair membership, order, orientation, criterion and versions cannot silently regenerate.
- Reviewer selection has a confirmation page and does not write progress. Formal keeps the active identity and own count visible. A/Equal/B selects; Submit saves; Undo invalidates only the immediate pending answer, retaining the original. Next removes normal edit access. Exit Study preserves everything and returns to Study Home.
- Researcher → Advanced / Recovery invalidates a response by ID with timestamp/reason. Original responses remain in backups and exports; normal completion and analysis exclude them. The reviewer then resumes the newly unanswered assignment. Recovery is blocked after unblinding.
- Researcher shows progress and assignments/provenance. Unblind validates completeness, versions, membership, overlap, A/B mappings, eligibility and calibration exclusion; it does not repair inconsistencies. Export separates Calibration, Formal and exploratory Play. Canonical preferences precede agreement calculation. Per-contrast Cohen's kappa is null when its denominator is zero. The dataset has 80 pairs and 96 correlated ratings, not 96 independent tasks.
- Post-hoc exports distinguish Ruff ties from ties where both Judge scores were actually measured. Missing/disabled Judge values are not treated as measured zeroes or evidence of a tie.
- Play uses the same catalog with versioned contrast playlists; All contrasts samples contrasts uniformly. It retains direct choice, guarded text selection/scrolling, reveal and Next, plus visit-local recap. Anonymous opted-in records have UUIDs, mapping, displayed/canonical choice, timestamps and versions. Retries are idempotent; opted-out choices are neither queued nor submitted. Play never advances Study completion. No names, email or student IDs are collected.

## Access and limitations

The hosted access code is verified server-side, comes from `STUDY_ACCESS_CODE`, and is never committed. Login issues an HttpOnly SameSite cookie and limits failed attempts. There are no accounts. Local fallback can use a salted browser verifier created after successful hosted login, or an explicitly configured `VITE_STUDY_ACCESS_CODE` for a fresh static-only installation. The latter is bundled into client code and is only a convenience gate.

Blinding is intended for non-adversarial authors: Formal DOM hides conditions, metrics, the other reviewer and results. The small service shares the complete protocol behind the access code, and public Play assets contain the canonical outputs. DevTools can inspect mappings; Researcher uses the same access code, not a separate authorization role. Server-projected mappings would add infrastructure without strong protection while public Play exposes the catalog. Authors should avoid Play/provenance and discussing Formal examples before independent review.

The service needs Node 24.12+ and persistent storage; SQLite is experimental in the verified Node version. One service/database represents one V2 study. A true restart requires a new version and preservation of the old database/backups, not a reset button. There is no offline PWA installation: run the same app locally when hosting fails. A cold device with no cache cannot recover unseen hosted answers during an outage; restore the latest backup. Pending conflicts are deliberately reported for researcher review.

Dependency installation reports three existing development-tool advisories (Vitest/mocker/tinypool). Production-only npm audit reports zero. This task does not force a major test-framework upgrade. Keep development/test servers local. Physical-device and screen-reader testing remain outside the browser emulation evidence.

See README for the practical sequence and commands. Final verification evidence is recorded in `VERIFICATION.md`; ignored `qa/v2` contains only isolated fixture databases, exports and screenshots.
