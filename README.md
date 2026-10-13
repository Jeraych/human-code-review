# Human Code Evaluation

A small local-first app for blinded pairwise human code preference studies and a lightweight comparison game. Vite, React, TypeScript, Shiki and plain CSS; no backend, accounts or remote result submission.

The game is presented as **Code / Choice**. Home offers a primary Play action and a separate Enter Study path. An unfinished Study resumes automatically and replaces the home Play action with Resume Study. Play keeps its fast card → reveal → next loop, with a persistent reveal/Next bar, native keyboard-accessible card targets, an optional N shortcut after reveal and phone Read A/Read B controls. Study keeps its calmer presentation and explicit Submit workflow.

## Current conditions

| Researcher selection | Frozen pool      | Trained outputs                                                    | Common Base reference                              |
| -------------------- | ---------------- | ------------------------------------------------------------------ | -------------------------------------------------- |
| Style Study          | evaluation-01 v1 | Runs 33–35; correctness + Ruff style reward                        | Base outputs archived with runs 33–35              |
| Judge Study          | evaluation-02 v1 | Completed formal runs 36–38; correctness + historical judge reward | The identical frozen Base candidates used in Style |

Both use the same 30 held-out tasks, prompt texts and generation index 0, with ten tasks per seed 3407/3408/3409. The original Style pool is unchanged. Judge runs did not include a new Base evaluation stage: the earlier matching Base samples are a shared archival reference, not Base generations produced during runs 36–38. There is no Combined placeholder or exploratory Judge data.

## Install and run

Use Node 22.12+ (tested on Node 24), npm and a normal Chrome/Edge window:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Use npm instead of npm.cmd on macOS/Linux.

For the built app:

```powershell
npm.cmd run build
npm.cmd run preview
```

Run development or preview one at a time; both use port 5173. On Windows, double-click **Launch app.cmd** to reuse the existing app server or start the built preview in a hidden process, then open the default browser. It refuses to take over another application's port. Logs/PID stay under ignored .runtime/.

Keep the same host/port, browser profile and device for resume. A normal browser restart resumes once the server is available. Local-first persistence does not mean an offline PWA. For static hosting, publish only dist/.

## Static deployment preparation

**Public deployment has not been approved or performed. Keep the GitHub repository private.** The prepared build works at a domain root or a subdirectory such as /demo/. Asset URLs respect Vite's relative base. Home/Play/Study/setup use #home, #play, #study and #research links, so direct navigation and refresh need no server-side SPA routing. Direct Play links still respect an active Study. Skip/content anchors do not change modes.

To deploy later, with explicit approval, use npm ci, build command npm run build and output directory dist. Vercel or another HTTPS static host can serve those files; no functions/database/environment secrets are needed. A subdirectory URL should end with / or point to index.html. Use HTTPS in deployment; localhost is suitable for the current local tool. Opening index.html through file:// is unsupported.

Set Cache-Control: no-cache for index.html so it references the current assets. Hashed assets can use a long immutable cache lifetime; retain previous hashed assets during an update if the host supports it. A detected stale dynamic import shows a manual reload/recovery prompt instead of automatically discarding an unsaved choice. Changing hosting origin separates browser storage: export Study backups before moving.

The product has favicon/title/description metadata. Highlighting's WASM engine loads when code is displayed, not on home. An 11-check browser smoke test served the unchanged production build under /demo/ with no missing assets or browser errors. No deployment plugin was invoked and no site visibility changed.

## Study mode

Researcher setup selects **Style Study / Judge Study**, enters a pseudonymous evaluator ID, then starts or continues a session. Participant presentation stays neutral: task prompt, anonymous A/B code and “Which implementation would you rather work with?”

Consider code you might use, maintain or receive from another developer. Automated correctness is a separate signal. A/B are relative preferences, About equal means no clear preference, and Both poor means neither is suitable. Optional multi-select reasons: Readability, Naming, Structure, Simplicity, Maintainability, Comments, Robustness and Other.

Each Study exhausts its frozen pool once. The random seed, shuffled order and balanced A/B assignments are saved before the first item. Stored assignments are authoritative. Submit saves successfully before advancing; responses determine the next unanswered pair. Draft choice/reasons survive refresh after a choice is selected.

Sessions are pinned to pool ID/version/hash. Style and Judge cannot resume into or overwrite each other. Starting another session retains earlier responses; saved sessions remain available in setup. Existing version-1.0.0 Style sessions are accepted without migration. New sessions record app version 1.1.0. Study never reveals identities or aggregate preferences, even at completion.

Use one tab and normal browser storage. Stale-write checks are best-effort, not distributed locking. Private browsing, cleared browser data, quota failures and origin changes can lose/separate progress. Export backups.

## Play mode

No evaluator ID is needed. Choose **Random / Style / Judge**. Random chooses a comparison uniformly first, then a pair within it; larger pools cannot dominate. Repeats are allowed.

Click a code card to vote immediately. About equal and Both poor also submit immediately. Enter/Space on a focused card selects it. Dragging text, scrolling, long presses and touch movement do not vote; a short stationary click does. Focus within the scrollable viewer allows keyboard reading without selecting its card.

After a vote, the chosen card is marked and both source identities appear. Code remains visible until **Next round**. Preference is never marked correct/incorrect. Visit-local counts are separated by Style/Judge: Base preferred, trained preferred, equal and both poor. Play votes never enter Study records.

Play is disabled while the active Study is unfinished. Starting a Study after Play requires acknowledgement and records prior exposure. Formal participants should not have inspected overlapping examples. Setup is researcher workflow, not authentication.

## Pool generation

Frozen browser assets are under public/pools/. Small separate provenance is under researcher/, which is excluded from dist/. Full training archives and checkpoint binaries are not committed.

The unchanged Style rule:

1. Sort task integers 50..99 by SHA-256 of UTF-8 human-code-evaluation-v1:{taskInteger}; select the first 30.
2. Allocate selection positions modulo three to seeds 3407/3408/3409.
3. Pair generation 0 by task ID within the corresponding source run.
4. Display unchanged extracted_code and the saved task prompt.
5. Apply no quality, correctness, syntax, length or identical-code filtering.

Judge reuses this exact task/seed assignment, prompt text and Base candidate IDs/code. All 600 formal Judge holdout rows were checked for unique task/generation coverage, item ordering, nonempty extraction and common extraction-policy agreement. Formal metadata records completion, matching dataset/split/model/chat/token settings, 500 groups, successful stages and passing health checks. All three runs record identical runtime hashes and the historical judge prompt. Run 37 has one syntax-invalid source output, outside the fixed subset; selection was not changed to remove it.

Sources relative to the SOFTENG700 course folder:

- Style: UnSloth-RL-heplus-fix/results/{33,34,35}/eval_base_holdout_tasks.csv and eval_lora_holdout_tasks.csv, startup logs and before_after_code.csv.
- Judge: UnSloth-RL-heplus-fix/results/{36,37,38}/logs/eval_lora_holdout/eval_lora_holdout_tasks.csv plus metadata.json, health.json and judge-summary.json.
- Task snapshot: UnSloth-RL/results/heplus_rows_0.json.
- Common archived baseline: 8cc4accd0c687a040543a791e472e3f5b236e2e2.
- Formal runs record source commit 6db72159491210cf81e1b7dee3940f1634525572.

Candidate provenance includes conditions, source files/runs/hashes, task/generation IDs, seeds/models, selected raw generations and displayed hashes. Judge records distinguish trained run 36/37/38 from Base reference run 33/34/35. No credentials or participant data are included.

To regenerate from the original adjacent archives, use Python 3.10+:

```powershell
python scripts/prepare_pools.py
python scripts/prepare_judge_pool.py
```

Importers need the archived source Git commit and the original folder layout. They refuse changed frozen v1 files. A standalone clone runs/tests using committed pools; raw-CSV regeneration additionally needs the source archives. No model loading/training or generated-program execution occurs.

Compact JSON content hashes, preserving field order:

- Style: 3bd17a5a0a0810b3e7c9ef3ad48ffe8775ceb5ebfea4b534e6e4afe4451c1d70
- Judge: b6918be4a841b8bb06c158314508a3bdbcb752b0ec80a9a5e967dec0205c0935

## Results and offline analysis

Download **JSON** at completion and give it to the researcher. JSON is authoritative; CSV is a convenience. Interim backups and validated JSON restore are available. Conflicting backup imports fail closed. Download does not establish researcher receipt.

Exports retain session/evaluator ID, pool ID/version/hash, protocol/app version, assignments, pair/prompt ID, displayed A/B candidate IDs, preference, taxonomy, optional text and timestamp. Researcher tooling joins opaque IDs to conditions; evaluator Study exports contain no answer key.

Store exports in ignored participant-results/ or outside the repository. Never use real responses as source fixtures.

```powershell
python scripts/merge_results.py participant-results/style01.json participant-results/style02.json --condition style --out participant-results/merged-style-01
python scripts/merge_results.py participant-results/judge01.json --condition judge --out participant-results/merged-judge-01
```

Merge each comparison separately. Compatible cumulative backups are combined; exact duplicates are removed; conflicting votes/pools/mappings fail closed. Repeated evaluator IDs are flagged. Use a new output directory. Merged JSON/CSV include A/B conditions, preferred condition and distinct A/B source runs. CSV formula-like text gets a leading apostrophe; JSON preserves exact text. Explicit --pool and --provenance support future datasets.

## Future Combined data

First obtain verified real outputs. Create a new immutable two-candidate pool and separate provenance, matching the existing task/seed/generation rule where valid. Retain old assets. Add its real entry to src/poolConfig.ts with a neutral pool ID, researcher label, pool URL, optional Play reveal URL and reference label. Supply the reveal/provenance and matched-data checks. The Study engine needs no condition-specific logic. Update merge instructions; increment protocol only if response meanings or instructions change.

## Research and privacy caveats

- Preference from inspection measures perceived usability/maintainability, not executable correctness or judge reliability. Base-vs-trained cannot isolate the incremental effect of one reward.
- Style includes correctness/supporting rewards. Run 35's 70 training test timeouts remain a caveat. Judge health is operational completion, not human validation of the judge.
- Historical dataset revision and checkpoint binary hashes are unavailable. The task snapshot is corroborated against saved training-task prompts; complete historical holdout chat prompts are unavailable.
- Formal remote runtime hashes are recorded, but the exact corresponding remote source snapshot is not available locally. Local formal generation/prompt/extraction ASTs agree with the common archived source. Sampling temperature/top-p follow its defaults; other evaluation settings are confirmed by formal metadata.
- Judge uses an earlier shared Base reference. Do not describe it as a new simultaneous Base evaluation.
- Report all four outcomes and explicit denominators. Evaluators/tasks repeated across pools are correlated; retain identifiers for analysis.
- Confirm recruitment, workload, prior exposure, consent and applicable university requirements before collecting formal responses. Browser pilots use synthetic votes, not research findings.
- Public static Play answer keys are fetched by the UI after voting but remain inspectable by a determined evaluator. Blinding assumes non-adversarial participants. A dedicated Study deployment can omit Play assets/navigation.
- Keep this repository private. .gitignore excludes .env/credentials, responses, models/checkpoints, training artifacts, node_modules, dist, QA/browser profiles and IDE/cache files. Ignoring files does not remove previously committed secrets; the publication audit also scans reachable Git history.

## Verification and code map

```powershell
npm.cmd test
npm.cmd run build
python -m unittest discover -s tests -p 'test_*.py' -v
python scripts/audit_repository.py
```

session.ts owns instrument validation/scheduling; storage.ts owns checked writes; export.ts owns results. App.tsx connects researcher setup, pool-aware Study and Play. Comparison.tsx shares symmetric code panels and guarded direct-click selection. VoteForm.tsx remains Study-only. play.ts owns uniform comparison sampling and preference counts. Shiki includes only Python and one theme.

Browser pilots scripts/pilot.cjs and scripts/pilot_judge_play.cjs require an existing Playwright installation and Chrome/Chromium executable. They use isolated test profiles and real frozen pools. Synthetic exports/screenshots stay under ignored qa/. Download-comparison tests skip until pilots produce files. See VERIFICATION.md for exact evidence and limits.

Additional pilots: scripts/pilot_release.cjs checks the new-player and returning-participant flows; scripts/pilot_touch.cjs sends actual touch events in a Chromium phone emulation; scripts/pilot_static.cjs creates a temporary localhost-only static QA server and checks subdirectory/direct links. Pass the Playwright module path and Chrome executable as arguments. Emulation is not physical iOS/Android or screen-reader verification. The core research files and frozen pools remain unchanged from 9eddbaa.
