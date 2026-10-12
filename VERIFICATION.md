# V1 verification — 12 October 2026, Pacific/Auckland

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
