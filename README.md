# Human Code Evaluation

A local-first, blinded pairwise preference study, with a separate lightweight Play mode. V1 uses real Base vs correctness + Ruff style-trained outputs only. No Judge or Combined data is included.

## Launch

Node 22.12+ (tested with Node 24), npm, and a modern normal Chrome/Edge browser window:

```powershell
cd D:\Study\uni\part4\Semester1\SOFTENG700\human-code-review
npm.cmd ci
npm.cmd run dev
```

Open http://127.0.0.1:5173. Dependencies are already installed in this delivered checkout, so `npm.cmd run dev` is sufficient. Or double-click `Launch app.cmd`: it opens the existing app server or starts the built preview in the background, then opens your default browser. It refuses to replace another application on port 5173. Launcher logs/PID are under ignored `.runtime/`. Keep this exact origin for local progress; changing host, port, browser profile, or device creates a different storage area.

For the built local pilot:

```powershell
npm.cmd run build
npm.cmd run preview
```

The preview and development server both use port 5173: run one at a time. A browser restart resumes progress once the server is running again. This is local-first persistence, not an offline PWA.

## Use

Enter a pseudonymous evaluator ID and start a Study. Read the task and both code panels; choose A/B/About equal/Both poor. Reasons are optional. Submit saves before moving forward. A draft preference and its reasons also survive refresh once a preference is selected. Reasons selected before any preference are not yet saved.

The first unanswered saved assignment determines resume, not a counter. A completed response cannot be submitted again. Use Researcher setup to continue any saved session, or deliberately start another; older sessions are retained. There is no destructive reset button.

Export JSON at completion and give the file to the researcher. Interim JSON backups are also available. CSV is a convenience; JSON is authoritative. A download does not establish receipt. Backup import validates the pool and refuses conflicting versions of an existing session. Store errors and incompatible pools fail closed, with raw recovery export available.

Use one tab. Concurrent changes are detected best-effort by comparing stored state and observing storage events; this is not a distributed lock. Use a normal browser window: private browsing, browser-data clearing, quota failures and origin changes can lose or separate progress. Export backups for long sessions.

Play samples the same real pool, permits repeats, reveals identities only after voting, and counts A/B/tie/both-poor votes only for the current visit. These votes are never written into Study responses. Play is disabled while the active Study is unfinished. A new Study after Play requires acknowledgement and records `priorPlayExposure`; for formal recruitment use participants who have not seen these examples. Switching active sessions is researcher-controlled, not an access-control boundary.

## Real data and frozen selection

Sources, relative to the course folder:

- `UnSloth-RL-heplus-fix/results/{33,34,35}/eval_base_holdout_tasks.csv`
- `UnSloth-RL-heplus-fix/results/{33,34,35}/eval_lora_holdout_tasks.csv`
- Corresponding `base_holdout.log`, `lora_holdout.log`, and `before_after_code.csv`.
- `UnSloth-RL/results/heplus_rows_0.json`, saved dataset task/prompt snapshot.
- Archived extraction function at source commit `8cc4accd0c687a040543a791e472e3f5b236e2e2`.

Each condition/run has 50 holdout tasks (HumanEval/50..99), four generations each. The builder verifies all 1,200 rows: exact task/generation coverage, unique keys, item index, and stored extracted-code agreement with the archived pure extraction function. Generated programs and the trainer are never executed.

Selection v1:

1. Sort task integers 50..99 by SHA-256 of UTF-8 `human-code-evaluation-v1:{taskInteger}`.
2. Select the first 30 distinct tasks.
3. Assign selection positions modulo 3 to runs 33/34/35 (seeds 3407/3408/3409), ten tasks per seed.
4. Pair base and trained generation index **0** within the same run/task.
5. Display each CSV's **unaltered `extracted_code`** and the task prompt from the saved snapshot.
6. Do not filter by tests, style score, length, syntax, attractiveness, or whether the candidates are identical.

This is a deterministic subset across all three seeds, not a full census of all generations. A generation index matches sampling position, not an identical stochastic draw. The Style-trained condition includes correctness and supporting rewards; it is not style-only training. Preference against Base cannot isolate the incremental effect of Ruff reward.

Frozen pool: `public/pools/evaluation-01-v1.json`, 30 pairs, opaque stable IDs. Pool SHA-256 of compact JSON with original field order:

`3bd17a5a0a0810b3e7c9ef3ad48ffe8775ceb5ebfea4b534e6e4afe4451c1d70`

`researcher/provenance-v1.json` records source-file hashes, selected raw generations and hashes, displayed hashes, task/generation indices, seeds, model and archived adapter path. It stays outside `dist/`. The builder refuses to overwrite a changed frozen v1 file. To reproduce using the bundled Python:

```powershell
& 'C:\Users\jacky\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts\prepare_pools.py
```

Use `python scripts/prepare_pools.py` on a machine with ordinary Python installed and this source folder layout.

## Provenance limits and researcher decisions

- The historical Hugging Face dataset revision and checkpoint binary hashes are unavailable. Prompt IDs and the local prompt-snapshot hash are retained. Snapshot text is corroborated against saved chat prompts for training tasks 0..9; complete original holdout chat prompts were not archived. Task identifiers/item ordering agree for all 50 holdout tasks. The frozen display is reproducible; exact historical dataset revision is not claimed.
- Generation settings (sampled, temperature 0.8, top-p 0.95) come from the archived generation function/default call; logs confirm four generations, 384 completion-token limit, model and seeds. Remote adapter paths are references, not available model binaries.
- Run 35 had 70 training test timeouts. It is included without selective exclusion; this caveat applies to interpretation.
- Confirm evaluator recruitment, workload, consent/any university study requirements, prior exposure, and this sampling rule before treating responses as final research evidence.
- Both poor and About equal remain separate; report all outcomes and denominators. Multiple participants judging the same task are correlated; the merge preserves evaluator/task/run identifiers rather than claiming statistical independence.
- Code is displayed as text with syntax highlighting. The app does not execute or repair it.

## Blinding boundary

Study downloads only the neutral pool and exports candidate IDs, not condition identities or experiment diagnostics. The optional `public/play/evaluation-01-v1.json` answer key is fetched by the UI only after a Play vote. Because this is a static demo, a determined evaluator can inspect that public asset; this is non-adversarial interface blinding, not secret server-side identity protection. For a dedicated Study deployment, omit the `play/` assets and disable Play navigation. Publish `dist/`, never the researcher directory or experiment archive.

## Researcher merge

Keep exports under the ignored `participant-results/` folder or elsewhere under researcher control. The offline script validates schedules/mappings and joins candidate IDs to conditions. Duplicate backups of the same session are deduplicated; cumulative nonconflicting backups are combined; contradictory responses fail closed. Repeated evaluator IDs across sessions are flagged. Output directories must be new.

```powershell
python scripts/merge_results.py participant-results/p01.json participant-results/p02.json --out participant-results/merged-01
```

`merged.json` preserves full session records and joined responses; `merged.csv` includes A/B conditions and preferred condition. The browser CSV and merged CSV escape spreadsheet formulas with a leading apostrophe; JSON preserves exact text.

## Code map and extension

- `src/session.ts`: validation, deterministic schedule, next unanswered assignment, response commit.
- `src/storage.ts`: local storage record and stale-write detection.
- `src/export.ts`: JSON/CSV and downloads.
- `src/App.tsx`: setup, Study and Play flows.
- `src/components/Comparison.tsx`: shared symmetric code panels; Shiki Python grammar and one theme.
- `src/components/VoteForm.tsx`: four choices and optional taxonomy.

To add a real Judge or Combined comparison, supply a new frozen pool in the same neutral schema, new separate researcher provenance and optional Play labels. Set the URLs in `src/poolConfig.ts` (or add a small researcher-only selector when multiple pools actually exist), keeping old pool files for saved sessions. The engine accepts generic candidate IDs and never decodes Base/Style. Add a Shiki grammar if language changes. Increment the protocol for changed instructions/choice meanings; do not attach old sessions to a changed instrument. No placeholder future conditions exist.

## Verification

`npm.cmd test` runs focused integrity tests; `npm.cmd run build` includes strict TypeScript checks. The browser pilot script requires an available Playwright installation and Chromium/Chrome executable. It uses a fresh isolated profile, completes all 30 pairs through the UI, checks refresh/restart/drafts, mapping, actual downloads, mobile overflow, Play reveal, preservation of earlier sessions and a pool mismatch. Its output and test-only participant exports are in ignored `qa/`; never include them in the real study.

See `VERIFICATION.md` for delivered evidence and boundaries. A software pilot does not establish a human preference result.
