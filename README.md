# Code / Choice — Human Validation V2

One React/Vite application for hosted Study, local fallback and public Play. V2 evolves the existing application; historical V1 remains available at `/?v1=1#home` with unchanged assets, storage and exports. The repository stays private. **No public deployment is authorized or performed.**

The full implementation/provenance/counts report is [V2_IMPLEMENTATION.md](V2_IMPLEMENTATION.md).

## Install and run V2

Use Node **24.12+** and npm. Verified on Windows with Node 24.12.0:

```powershell
npm.cmd ci
npm.cmd run build
```

Double-click **Launch app.cmd**. On first launch it asks you to choose one Study access code, stores it only in ignored `.env.local`, starts the local Node/SQLite service in a hidden process and opens `http://127.0.0.1:5173/`. The code opens the main Study. Offline reviewers receive their own Study file and do not need the code. It refuses to take over an occupied port. Stop an older preview/dev server first. It starts no ratings. Normal Study data lives in ignored `.runtime/study-v2.sqlite`; keep that database, its WAL files and exported backups private.

For an explicit terminal process, create `.env.local` with your own code:

```text
STUDY_ACCESS_CODE=<your-own-code-at-least-8-characters>
```

Then:

```powershell
npm.cmd run serve
```

This serves the production build and API at `http://127.0.0.1:8787/`. Stop with Ctrl+C. Do not delete the database to restart a research protocol.

For development, leave `npm.cmd run serve` running on port 8787, and run this in a second terminal:

```powershell
npm.cmd run dev
```

Open `http://127.0.0.1:5173/`; Vite proxies `/api` to the service. For a static production preview:

```powershell
npm.cmd run preview
```

Preview runs on 5173 and has no persistence API. Stop dev/launcher before previewing. Play still works; Study uses local fallback as described below. Use `npm` instead of `npm.cmd` on macOS/Linux.

## Hosted configuration

The normal workflow requires the small Node service, not a static-only host. Run `npm ci`, `npm run build`, then `npm run serve` on a Node 24.12+ host with a **persistent disk**. Set server variables through the host's secret/configuration facility:

| Variable | Purpose |
|---|---|
| `STUDY_ACCESS_CODE` | Required shared Study code, minimum 8 characters; never commit it |
| `STUDY_DB_PATH` | SQLite file on the persistent disk; default `.runtime/study-v2.sqlite` |
| `HOST` | Default `127.0.0.1`; use `0.0.0.0` when your host requires it |
| `PORT` | Default `8787`; host-assigned port supported |
| `COOKIE_SECURE` | Set `1` behind production HTTPS |
| `APP_ORIGIN` | Exact public origin when proxy forwarding changes the Host header |
| `STUDY_TRANSPORT` | Optional `hosted` or `local`; defaults to local on localhost/127.0.0.1 and hosted on remote origins. Set `hosted` explicitly behind a proxy or for shared local-network QA |
| `APP_BASE_PATH` | Optional prefix such as `/demo`; serve at `/demo/` |

Use one service instance and SQLite database. Serve frontend and API on the same public origin; proxy `<base>/api/*` to this service when a separate static frontend is needed. An ephemeral/serverless filesystem loses shared progress and is unsuitable. Hash routes and relative Vite assets support root/subdirectory hosting without SPA rewrites. Back up the database using SQLite backup tools or stop the service before copying the database and associated WAL files.

No host has been provisioned or publicly deployed. Backend/device-resume verification used localhost and isolated browser contexts, not a live remote deployment. Built-in [Node SQLite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html) avoids an additional database package; it is experimental in the tested Node version.

## Human review

Open **Study**. The start screen follows the actual workflow:

1. **Calibrate together** — discuss the examples; reveal is allowed here. At the end, agree the guideline and click **Finish Calibration**. This locks the guideline and prepares the reviews in one action. Calibration never enters the results.
2. **Review together** — choose one shared A / Equal / B answer per blinded comparison. These answers enter the Formal results and their pairs cannot appear in Independent review.
3. **Review independently** — Jacky and Conrad click **Review on this device** or **Continue** beside their own name. Intentional overlap remains independent; agreement and Cohen’s kappa use only these overlapping Independent responses.
4. When everyone is finished, click **View results**, then **Export research data**. Results combine the three review streams, with separate reviewer summaries in **Results by reviewer**. The research export retains the original sources, mappings and audit history.

While reviewing, the page contains the reviewer/phase and count, task, Code A/Code B, A / Equal / B, and Submit. The frozen guideline is one disclosure away. Submit saves explicitly; Undo is available before Next. **Exit** returns directly to the Study start screen. Progress remains when exiting, refreshing or closing the browser.

**Edit setup** is a small action on the main Study start screen. It contains comparison checkboxes and four totals. Recommended defaults are unchanged:

| Setting | Default |
|---|---:|
| Calibration | 10 |
| Joint review | 50 |
| Independent · each | 50 |
| Overlap | 10 |

The live workload remains **150 Formal ratings / 140 distinct Formal pairs** with these defaults. These values are editable before Formal responses begin. Counts are distributed as evenly and deterministically as possible across selected comparisons. Empty selections, impossible overlap and insufficient eligible pools block saving with a reason and available counts. Requested counts never silently shrink. Criterion, seed, capacity diagnostics and deliberate regeneration stay under Advanced.

The first Joint or Independent Formal response freezes configuration, criterion and assignments, including after Undo. Existing per-comparison V2 studies keep their original allocations. Editing totals deliberately creates a new setup; no historical study is silently migrated. Holdout-only, both correctness-pass and exact-identical exclusion defaults, automatic task/seed/A–B balance, frozen source data and provenance remain unchanged.

## Review on separate computers

On the main computer, **Send review to Conrad** (or Jacky) saves that person’s reviewer file. Send the file yourself. On the receiving computer, open the same app → Study → **Open reviewer file** → Start. Identity comes from the file; no Study code or identity confirmation is required.

When finished, click **Save result for researcher** and send that file back. On the main computer, use **Import Conrad result** beside Conrad’s progress. When all reviews are complete, View results combines them. These buttons save/open files locally; they do not send messages or upload to an external service.

**Open reviewer file** remains available on the local Study start screen, after login and after completion. It works without refreshing. Opening a different reviewer or study preserves the previous package and responses on the device; **Other reviews saved on this device** lets you reopen that work or save its result. Reopening the same file retains cumulative progress. Incompatible, altered or conflicting files fail without overwriting responses. **Main study** leaves the reviewer file and returns to the main workflow; the main Study requires its access code.

## Shared hosted review

On a shared Node/SQLite service, reviewers open Study, click their name and continue. Progress synchronizes automatically. Normal hosted screens hide file sending/import controls; offline transfer remains under Study options → Advanced. Browser refresh/close reuses a valid server session without another code prompt. Service restart or session expiry may require the code again; saved answers remain.

No public/remote hosting has been configured or deployed. Localhost defaults to local file transfer with persistent main Study storage; remote origins default to hosted transport, overridable with `STUDY_TRANSPORT`.

## Start over and history

On the main Study start screen, **Study options → Start over** asks once for confirmation and archives the old protocol, assignments, responses, original imported files and analysis. It returns to Calibration while retaining the setup. Imported reviewer progress remains saved. Researcher access is required; reset never deletes historical data.

Rare backup/restore, response invalidation, provenance, historical protocol inspection and explicit **V1 recovery** live under **Study options → Advanced**. V2 is always the normal application, including import, Exit, refresh, reset and restart. V1 is loaded only by an explicit `?v1=1` historical recovery link; V1 files and storage remain intact.

Back up/export results before clearing browser storage or changing origin. Avoid concurrent tabs for the same reviewer. A static reviewer installation needs a local web server; it is not a standalone `file://` application.

## Play and privacy

Play needs no login or reviewer identity. A/Equal/B gives immediate reveal and Next. Read A/Read B, safe scrolling/text selection and native keyboard controls are retained. Play never consumes Study completion. Playlists share the canonical pair database; a recap is visit-local.

By default, opted-in anonymous Play responses are queued locally and sent to the hosted service with idempotent response IDs. They contain anonymous session ID, pair ID, displayed mapping/choice, canonical preference, timestamp and app/pool versions. No name, email or student ID is requested. **Play without storing new responses** opts out for subsequent choices; it does not retract previously opted-in responses. External responses remain exploratory pending ethics/course confirmation.

Optional build setting `VITE_PLAY_NOTICE` customises the concise collection notice. Researcher can refresh/export exploratory Play summaries separately, even before Formal unblinding. No fake anonymous users were added during verification; browser Play QA used opt-out.

## Frozen data and verification

V1 assets remain under `public/pools`, `public/play` and `researcher/*-v1.json`. V2 adds `public/v2/catalog.json`, five output files and `researcher/provenance-v2.json`. All pairs are holdout tasks 50–99 matched by task/seed/ordinal. Every eligible Formal side passed tests; exact duplicates stay in the record but are excluded from the displayed primary sample. No metric/answer-based Formal selection occurs. Counts and historical limitations are in [V2_IMPLEMENTATION.md](V2_IMPLEMENTATION.md).

```powershell
npm.cmd test
npm.cmd run build
```

The real-source builder needs the adjacent course artifacts, including `combined_39_41_review.tar.gz`; a standalone clone uses the committed frozen files. On this machine, the verified Python runtime is:

```powershell
$PythonExe = 'C:\Users\jacky\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
& $PythonExe scripts/prepare_v2.py
& $PythonExe -m unittest discover -s tests -p 'test_*.py' -v
& $PythonExe scripts/audit_repository.py
```

Another machine can use its Python 3.10+ executable. The builder refuses changed frozen files; use a new version for new data. It never imports GPU trainers, executes generated code or regenerates outputs.

Browser QA (requires an existing Playwright module and Chrome executable):

```powershell
node scripts/pilot_v2_guided.mjs 'C:\Users\jacky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright' 'C:\Program Files\Google\Chrome\Application\chrome.exe'
```

This uses only ignored `qa/v2/fixture-*.sqlite` databases and clearly synthetic QA response fixtures. It does not start the actual study. See [VERIFICATION.md](VERIFICATION.md). Production dependency audit has zero advisories; the inherited dev/test dependencies have three reported advisories, recorded in the implementation report, and have not undergone a forced major upgrade.

---

# Historical V1 documentation

The material below describes V1 only. V2's rules and commands above take precedence for the final study.

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
