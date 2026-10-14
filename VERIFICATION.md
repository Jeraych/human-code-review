# Joint Consensus / total-count / starter navigation verification — 14 October 2026

Baseline: PRIVATE main d3d842a. No source outputs, pools/provenance, V1 app modules, dependency lockfile, or operational responses were modified. New research responses were created only as synthetic fixtures in ignored QA storage. No deployment or model-output generation occurred.

| Check | Result |
|---|---|
| TypeScript unit tests | 78 passed (69 prior regressions + 9 new consensus/totals tests) |
| Python merge/download checks | All 7 passed |
| Strict TypeScript / production build | Passed; existing app/Shiki chunk-size warnings remain |
| V2 existing workflow / configuration / transport / integration | 36 / 20 / 43 / 14 passed |
| New consensus + starter/reset browser suite | 22 passed |
| Every historical V1 browser suite | Base 26, Judge/Play 37, release 15, touch 8, static subdirectory 11 passed |
| Total browser checks | 232 passed, zero runtime errors |
| Repository credential/artifact audit | Zero findings |

New unit coverage verifies the 10/50/50/10 defaults and exact 150 ratings/140 distinct pairs, subset/remainder allocation grids, per-phase balance, disjoint pair sets, eligible/balanced presentations, infeasible counts and exact capacity errors, zero-Calibration/zero-Joint/zero-Independent/all-overlap boundaries, Joint Submit/Undo/freeze/history, old Joint exclusions after replacement, phase-normalized exports, shared file identity and safe merge, and unchanged kappa when only Joint choices change. Historical V2 invariant fixtures explicitly retain the legacy configuration rather than assuming the new defaults rewrite old saved studies.

New browser coverage completes Calibration/lock/generation, blinded consensus Submit/Undo, shared Joint resume on a clean context, actual offline Joint Study/Result transfer, Independent reviewer packages/results, paused starter escape/reload/resume after completion, separate summaries/exports, Independent-only agreement and reset from the header. Reset preserved 14 raw Formal records (13 active ratings plus an original undone consensus response) and all three imported source files. Exact default preview and mobile layouts were inspected at 1440×1000 and 390×844.

Existing V2 pilots retained their checks with totals-based setup; the official workflow now derives 10 Calibration, 50/50 Independent, 10 overlaps and all 150 active Formal ratings when completed. All legacy V1 pilots use isolated static preview/browser profiles; their optional URL argument prevents touching the user's normal service. The release brand selector was scoped to the original brand link to distinguish it from the existing explicit V1 exit link. Python checks verified freshly produced legacy browser downloads.

Operational Study DB was opened read-only: revision 19 and logical-state SHA-256 9315da7485fe9536aa831fbe5b4efc4860dc24643cee0b41105d5a58e1780a14 remained unchanged during implementation. Existing manual QA and V1/V2 history were preserved. Verification is local browser emulation, not a deployed remote host or physical-device/screen-reader test.

Frozen capacities are 354 / 380 / 332 / 226 eligible distinct pairs. Default fresh Calibration leaves 351 / 377 / 330 / 224; currently preserved Calibration/history leaves 351 / 377 / 327 / 223. These are capacity limits before subtracting Joint reservations for Independent, not independent additive quotas for each phase. Diagnostics report the actual configuration-dependent pool.

Re-run new suite: `node scripts/pilot_v2_consensus.mjs <Playwright-module-path> <Chrome-executable-path>`; all historical suites: `node scripts/pilot_legacy_all.cjs <Playwright-module-path> <Chrome-executable-path>`. QA fixtures/reports/screenshots stay ignored under qa; no dependency was added.

---

# Simplified V2 Study workflow verification — 14 October 2026

Baseline: clean PRIVATE main at ff1a585. The study engine, official defaults, canonical pools/provenance and historical V1 data remain intact; only protocol transport metadata is added to saved V2 state.

| Check | Result |
|---|---|
| Strict TypeScript / production build | Passed; existing app/Shiki chunk-size warnings remain |
| TypeScript tests | 69 passed: prior V1/V2 safeguards plus reviewer package identity, checksum/content tamper rejection, cumulative merge/conflicts, stale malformed files, Undo/finalized pending state, source-file hashes and archived replacement |
| Python historical merge/download checks | 7 passed |
| Exact offline + hosted journeys / routing | 43 browser checks passed |
| Researcher configuration pilot | 20 passed |
| Existing official V2 safeguards pilot | 36 passed |
| API / subdirectory / dev / preview / launcher | 14 passed |
| Repository credential/artifact audit | Zero findings |

Offline QA exercised Joint Calibration → guideline lock → Generate Study → both reviewer exports → clean-browser imports with automatic identity → several answers / Undo → Exit → reload / Continue → completion / Result export → matching reviewer imports → overlap readiness → conflict rejection → Merge & Analyse → readable summary → final export. The final export retained both original result files, their SHA-256 hashes, original invalidated responses and configured workload. Reset preserved completed evidence and sources in immutable history. Reviewer recovery exported that reviewer's Result and returned without a code/identity step.

Hosted QA used independent reviewer contexts and one isolated SQLite database. Both reviewers answered, closed and reopened, resumed their own exact progress, and the researcher received both counts automatically. A real service restart preserved identical responses and frozen assignments; expired sessions requested the code without losing the local cache. Both reviewers completed synthetic assignments; shared unblinding, summary and final export passed with no normal file transfer.

Routing regressions cover explicit `v1=1`, false/presence-only query flags, ordinary hashes, legacy exit, browser Back/Forward, same-document history and persisted V1 state. A stale workflow service requests restart and cannot write through the old backend or select V1; the launcher rejects stale V2/unrelated services without taking them over. HTML revalidates and built assets use content hashes; stale chunk handling preserves browser progress.

Screenshots inspected at 1440×1000 and 390×844: generated Studies lead with prominent transfer/progress actions, setup and Advanced follow below, fields remain within the viewport, and Formal code stays symmetric/blinded. File controls support keyboard Enter/Space and use descriptive accessible names. Browser pilots reported zero runtime errors.

All new answers came from synthetic fixtures in ignored `qa/v2/*-fixture*.sqlite` / `transport-*.sqlite` files and isolated browser contexts. No actual research ratings or public Play records were started. A read-only operational DB check found revision 15, one Calibration answer and four Formal records; the user explicitly confirmed these are existing manual QA answers. Those records and their archived protocol were preserved. Before real Calibration, deliberately Reset Study to archive this manual test and check the intended setup.

No remote host was configured/deployed. Evidence is localhost browser emulation, not physical-device/screen-reader QA. No sampling pools or generated model code were changed/executed. Historical verification below is retained as dated evidence.

Re-run: `node scripts/pilot_v2_transport.mjs <existing-Playwright-module-path> <Chrome-executable-path>`. QA databases, source files, screenshots and `transport-verification.json` remain ignored under `qa/v2`; no browser dependency was added to the app.

---

# Researcher-configurable V2 verification — 14 October 2026

Scoped evolution from a5356af: configuration lives in the existing Researcher workflow, with original official values as defaults. V1 modules/assets, all canonical V2 pools and provenance, and actual research storage are untouched.

- 58 TypeScript tests passed, including original V1 regressions, real pool/hash checks, config-derived workloads, single/multiple contrast subsets, odd and zero-overlap allocations, all-overlap assignments, seed/task/A/B balance, impossible settings, legacy V2 in-place compatibility, immutable started protocols and archived resets/replacements/imports.
- Seven existing Python merge/download checks passed; publication audit found zero issues.
- Strict TypeScript and production build passed. Application/highlighting chunk-size warnings remain; no dependencies were added.
- Configurable Researcher browser pilot: 20 checks passed, including live preview and validation, saving before ratings, seed edits after Calibration, deliberate Formal regeneration, reviewer-only controls, freezing after Undo, server rejection of silent edits, explicit archived replacement, refresh and configured analysis/export.
- Official V2 browser workflow: all 36 existing checks passed, now deriving workload assertions/loops from configuration.
- V2 static/service/launcher integration: all 13 checks passed.
- Desktop (1440×1000) and mobile (390×844) screenshots inspected; form stays within the viewport. Criterion label is explicitly associated with the textarea.

Browser responses exist only in ignored isolated QA fixture databases; no actual Calibration or Formal ratings were started and no fake public Play records were created. Server/device verification remains localhost, not a configured remote deployment. History is kept in optional protocol editions/archives and included in backups/exports; existing absent-field V2 records retain their exact assignments without migration.

New pilot: `node scripts/pilot_v2_configuration.mjs <existing-Playwright-module-path> <Chrome-executable-path>`. It uses qa/v2/configuration-fixture-*.sqlite, with screenshots/report under qa/v2; no real-study database is used. The original historical verification below remains for provenance.

---

# Human Validation V2 verification — 14 October 2026, Pacific/Auckland

Starting baseline: clean main at 24b0ae5; successful origin fetch confirmed no ahead/behind changes. GitHub API confirmed Jeraych/human-code-review is private and its default branch is main.

| Check | Fresh result |
|---|---|
| Lockfile installation (`npm.cmd ci`) | Passed; no dependency versions changed |
| TypeScript/Vitest suite | 43 passed, including 12 focused V2 tests and all 31 prior tests |
| Strict TypeScript + production build | Passed; existing Shiki WASM chunk size warning remains |
| Python V1 merge/download suite | 7 passed |
| Real-source V2 importer + immutable re-run | Passed; 3,000 outputs, 2,400 matched slots, source/code hashes and configuration checks |
| V2 workflow browser pilot | 36 checks passed; no runtime errors |
| V2 integration browser/launcher pilot | 13 checks passed; no runtime errors |
| Existing V1 static subdirectory pilot | 11 checks passed; no failed assets/runtime errors |
| Production dependency audit | Zero advisories |
| Full dependency audit | Three inherited dev/test advisories; recorded in V2_IMPLEMENTATION.md |
| Repository history/working-file credential/artifact scan | Zero findings |

V2 workflow checks cover calibration selection/Submit/reveal/locking, exact 48/48 assignments with 16 overlaps, premature-unblind prevention, reviewer confirmation without writes, Formal DOM blinding, explicit Submit, auditable Undo, locking older answers, Exit/refresh, fresh-device shared resume, stale-write/assignment-tamper rejection, API outage/local resume, JSON backup, pending-answer sync, complete-protocol unblinding/export and V1 access. Integration covers /demo/ production assets/hash routes/login/cookies, real SQLite persistence across service restart, actual Vite dev/preview entrypoints, hidden Windows launcher startup/reuse and refusal to occupy an unrelated port.

Screenshots were inspected at 1440×1000 and 390×844. The observed mobile playlist overflow and unavailable-Judge-as-zero display were corrected. Home, symmetric code panels, safe selection/scrolling, Play reveal focus and Formal readability were checked in the rendered UI. Desktop/mobile screenshots and machine-readable reports are ignored under qa/v2.

All browser protocol answers are clearly isolated synthetic QA fixtures in qa/v2/fixture-*.sqlite, never the normal .runtime/study-v2.sqlite. Play walkthroughs opted out; the tested service recorded zero anonymous Play responses. No actual Calibration/Formal ratings or fake public players were created. No model code was executed, no raw experiment files were edited, no outputs were regenerated, and no public site was deployed.

Evidence boundaries: service/device workflows were verified on localhost, not on a provisioned remote host. Anonymous opt-in transport/storage is implemented; browser QA intentionally did not submit Play responses. Server access-code verification and supplied-environment launcher startup were exercised; the interactive first-use secure prompt was source-inspected. Phone emulation does not establish physical iOS/Android or screen-reader compatibility. The app uses non-adversarial browser blinding and a shared Study access code, as detailed in the implementation report.

Re-run commands are in README. The pilots require Playwright/Chrome paths and keep test artifacts under qa; there is no browser automation dependency added to the app. Production/service code uses Node 24.12.0; built-in SQLite reports an experimental warning in that version.

---

# Historical V1 verification

# V1 verification — 12 October 2026, Pacific/Auckland

## Product polish — 13 October 2026

Scope: product/game layer only. Research/session/storage/export/type modules, both frozen pools and all provenance are unchanged from commit 9eddbaa, verified by Git diff. No Combined data or research-schema change.

- Added Code / Choice home with Play as primary action and a separate research entry. Active Study resumes and blocks overlapping Play, including direct links.
- Refined symmetric code cards, native vote buttons, safe scrolling/selection, phone reading shortcuts, persistent focused reveal with chosen side/condition and manual Next comparison. N is available after reveal. No correct/wrong scoring or auto-advance.
- Recovery messages explain failed writes, stale tabs, missing pools and invalid backups; technical details are collapsed. Existing data is never silently replaced. Empty/malformed import attempts give explicit feedback.
- Production title/favicon/description, relative asset base, hash navigation and deferred WASM initialization prepared. Manual stale-build recovery preserves choice/progress. No public site deployment.

Final evidence:

| Check                                               | Result           |
| --------------------------------------------------- | ---------------- |
| Strict TypeScript + production build                | Passed           |
| Unit suite, including original research regressions | 31 passed        |
| Python merge/download suite                         | 7 passed         |
| Style browser regression                            | 26 checks passed |
| Judge/direct-vote browser regression                | 37 checks passed |
| Product home/reveal/mobile/recovery walkthrough     | 15 checks passed |
| Chromium phone emulation with actual touch events   | 8 checks passed  |
| Local static /demo/ deployment + direct-link smoke  | 11 checks passed |

All browser pilots reported zero runtime errors. Static smoke reported no failed asset responses, confirmed that home does not request highlighting WASM, checked route refresh and active Study protection, and simulated stale-build recovery without losing saved data.

Visual evidence: qa/release-home-desktop.png, qa/release-home-mobile.png, qa/release-play-desktop.png, qa/release-play-mobile-final.png, qa/release-play-mobile-viewport.png and qa/release-touch-reveal.png. Desktop/390px phone layouts inspected. Full-page captures during sticky positioning or entrance animation can show transient capture artifacts; the settled actual phone viewport was inspected separately (solid reveal, chosen B and Next visible).

Practical boundaries before public release: test physical Safari/iOS/Android and a screen reader; review the Code / Choice identity/copy and intentional static Play answer-key visibility; obtain explicit public deployment approval. Current checks establish Chromium desktop/emulated-touch functionality, not a WCAG certification or a human preference result. The Shiki WASM chunk still produces a non-blocking build size warning; it is deferred until code is shown. QA exports/profiles are synthetic and ignored.

## V1.1 Judge integration and Play update — 12 October 2026

- Formal Judge sources: runs 36/37/38, seeds 3407/3408/3409. Completed/formal metadata, all passing health checks and 500 groups verified. All 600 holdout rows have the exact 50-task × four-generation coverage and nonempty extraction consistent with the common extraction function. Source runtime hashes and historical judge instrument agree across seeds.
- Judge selection exactly reuses Style's 30 task IDs, prompt texts, seed allocations, generation 0 and frozen Base candidates. The Style pool/provenance have no Git diff. Judge runs did not contain a new Base evaluation stage; same-seed archival Base from runs 33–35 is explicitly retained as the shared reference. The exact executed remote source snapshot/dataset revision/checkpoint hashes remain unavailable.
- Judge pool hash reproduced: b6918be4a841b8bb06c158314508a3bdbcb752b0ec80a9a5e967dec0205c0935. Run 37's one syntax-invalid source output is outside the fixed subset; no selection/filter changed because of it.
- Production TypeScript/build passed. All **24 unit tests** passed, including 14 original regressions and ten matched-Judge/pool-isolation/Play-sampling checks.
- **Seven Python checks** passed, including actual downloaded Style and Judge CSV/JSON agreement, Judge condition/source-run joins, deduplication and conflict rejection.
- Original browser regression: **26 checks passed**, zero runtime errors.
- Judge/Play browser pilot: **37 checks passed**, zero runtime errors. Judge Study completed all 30, restarted/resumed correctly and exported results; two Study conditions coexist and resume independently. Direct A/B/equal/poor votes, double-click protection, keyboard activation, correct Style/Judge reveals, Random valid-pool sampling, real overflowing-code scroll, text dragging, long press and mobile choices were exercised. Play did not modify either Study.
- Screenshots inspected: qa/judge-play-reveal-desktop.png at 1440×1050 and qa/play-mobile.png at 390×844. Symmetric before-vote cards, marked choice after voting, retained reveal, responsive stacking and no document overflow. Statistics use a horizontally scrollable table on narrow screens.
- Publication audit scans reachable Git history plus versioned/proposed files for excluded artifacts and credential patterns; zero findings. Largest file is approximately 113 KB of selected Judge provenance. Real participant exports, QA/profile files, credentials, models, training archives, dependencies and dist are excluded. Pattern scanning is bounded evidence, not a universal secret-detection guarantee.

Additional pilot reproduction (same runtime arguments as below): scripts/pilot_judge_play.cjs. Reports and all participant-like data under qa are synthetic tests and are never uploaded. No real human results or Combined pool exist.

The original V1 evidence follows for historical context.

Verified software behaviour; no real participant study has been conducted.

| Check                            | Evidence                                                                          | Result                                                                                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source integrity                 | `scripts/prepare_pools.py`                                                        | All 1,200 source rows checked for coverage, unique pairing keys and extraction consistency; frozen 30-pair build reproduced with unchanged SHA-256 |
| TypeScript and production bundle | `npm.cmd run build`                                                               | Passed; Python-only Shiki grammar and shared theme bundled; non-blocking chunk-size warning for Shiki's Oniguruma WASM                             |
| Core integrity                   | `npm.cmd test`                                                                    | 14 tests passed                                                                                                                                    |
| Offline merge and downloaded CSV | `python -m unittest discover -s tests -p 'test_*.py' -v`                          | 5 checks passed; duplicates deduplicated, contradictory votes/mappings/pools rejected, actual browser CSV matches JSON                             |
| Browser pilot, production build  | `scripts/pilot.cjs` with installed Chrome and an isolated persistent test profile | 26 checks passed, zero browser runtime errors                                                                                                      |
| Visual inspection                | `qa/study-desktop.png`, `qa/study-mobile.png`                                     | Inspected 1440×1050 and 390×844 layouts; equivalent panels, stacked mobile layout, no document overflow                                            |
| Published assets                 | `dist/` listing                                                                   | Contains evaluator pool and optional Play labels; excludes full researcher provenance, raw archive and participant records                         |
| Launch shortcut                  | `scripts/launch.ps1 -NoBrowser`, followed by `-CheckOnly`                         | Started its own hidden local preview after stopping the previous test server; second check reused the same server                                  |

Browser pilot covered:

- Persisted complete schedule before the first item; correct rendered A/B mapping.
- No identity request or condition labels in Study UI.
- Refresh restores an unsubmitted preference/reasons; submitted response persists.
- Closing Chrome and reopening the same isolated profile resumes the next unanswered pair with the original schedule.
- All 30 pairs submitted exactly once, with every choice type represented.
- Actual JSON and CSV downloads; complete JSON equals locally saved responses.
- Play disabled during active unfinished Study; no reveal before voting; reveal afterwards; next round hides identities; Play leaves formal responses unchanged.
- Starting another session preserves the completed original.
- Changed pool blocks voting; failed saves do not advance; valid backup import works; conflicting backup refused; corrupt storage is not overwritten.

The browser pilot uses explicitly synthetic participant votes in ignored `qa/`. They are not research findings. `qa/pilot-report.json` records the checks and isolated profile path. The Python downloaded-CSV check is skipped in a fresh clone until the browser pilot generates its downloads; the other merge checks use in-memory synthetic votes over real frozen pairs.

Reproduction in this desktop environment (server must be running):

```powershell
node scripts/pilot.cjs 'C:\Users\jacky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright' 'C:\Program Files\Google\Chrome\Application\chrome.exe'
& 'C:\Users\jacky\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m unittest discover -s tests -p 'test_*.py' -v
```

Boundaries: Windows sandbox blocked npm network and Vite/Vitest realpath operations; dependency installation, build/tests and browser launch succeeded outside that sandbox. No training, generated-program execution, external result submission or remote repository push occurred. Storage is browser-local and best-effort across tabs. Blinding assumes non-adversarial evaluators; the public Play answer key is inspectable. Historical dataset revision/checkpoint binary hashes remain unavailable. Recruitment, session workload and final research protocol need researcher confirmation.
