# V1 verification — 12 October 2026, Pacific/Auckland

Verified software behaviour; no real participant study has been conducted.

| Check | Evidence | Result |
| --- | --- | --- |
| Source integrity | `scripts/prepare_pools.py` | All 1,200 source rows checked for coverage, unique pairing keys and extraction consistency; frozen 30-pair build reproduced with unchanged SHA-256 |
| TypeScript and production bundle | `npm.cmd run build` | Passed; Python-only Shiki grammar and shared theme bundled; non-blocking chunk-size warning for Shiki's Oniguruma WASM |
| Core integrity | `npm.cmd test` | 14 tests passed |
| Offline merge and downloaded CSV | `python -m unittest discover -s tests -p 'test_*.py' -v` | 5 checks passed; duplicates deduplicated, contradictory votes/mappings/pools rejected, actual browser CSV matches JSON |
| Browser pilot, production build | `scripts/pilot.cjs` with installed Chrome and an isolated persistent test profile | 26 checks passed, zero browser runtime errors |
| Visual inspection | `qa/study-desktop.png`, `qa/study-mobile.png` | Inspected 1440×1050 and 390×844 layouts; equivalent panels, stacked mobile layout, no document overflow |
| Published assets | `dist/` listing | Contains evaluator pool and optional Play labels; excludes full researcher provenance, raw archive and participant records |
| Launch shortcut | `scripts/launch.ps1 -NoBrowser`, followed by `-CheckOnly` | Started its own hidden local preview after stopping the previous test server; second check reused the same server |

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
