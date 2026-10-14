# Play pool audit (15 October 2026)

Read-only audit of frozen canonical V2 data. No Formal catalog, assignments, responses, exports or analysis were edited. Historical V1 is retained as recovery and its scheduler is unchanged.

| Contrast | Catalog | Formal / previous Play | Curated Play | Exact equal | Existing normalized equal | Invisible equal |
|---|---:|---:|---:|---:|---:|---:|
| B-C | 600 | 354 | 272 | 182 | 182 | 184 |
| C-S | 600 | 380 | 243 | 139 | 139 | 141 |
| C-J | 600 | 332 | 235 | 201 | 201 | 202 |
| S-SJ | 600 | 226 | 133 | 304 | 304 | 304 |

- Catalog: 2400 comparisons across 50 task prompts; 1292 eligible Formal / previous Play pairs; 883 curated Play pairs.
- Exact identical sides: 826; examples: p_2f7e564a10d7bdf8ad810d2f, p_beaa9508c0cf8cd02fcf5b5c, p_1e049226d3a6f184d4e72cae, p_c6cb6b729021f27614136e08. Formal eligible exact identical: 0.
- Invisible equality (line endings, trailing space, edge blank lines only): 831; examples: p_2f7e564a10d7bdf8ad810d2f, p_beaa9508c0cf8cd02fcf5b5c, p_1e049226d3a6f184d4e72cae, p_c6cb6b729021f27614136e08. Eligible invisible: 5; their pair IDs: p_f9d047802042fca27ce759e4, p_2c1a871c3e2863ca21ee20f9, p_14d23ac112ed3073484b1f5c, p_71165cc92a099dc19c2e1588, p_16aba8ef225c20b80a1ac2ea.
- Catalog normalized flag: 826. This is the original outer-whitespace-only provenance rule, retained unchanged.
- Repeated unordered visible comparison groups within a task, across contrast/seed/ordinal: 301, containing 1690 pairs; examples: p_2f7e564a10d7bdf8ad810d2f, p_beaa9508c0cf8cd02fcf5b5c, p_1e049226d3a6f184d4e72cae, p_c6cb6b729021f27614136e08; p_880f6448642a0a1b9a65ec20, p_fb80e450fa1f1322e5dd7273, p_83638a24c031d52912096ca1, p_1ab6c5f4f448c9ee925ea689; p_cf199aab59d6195ed585d5bd, p_653818cd526092312c20742e, p_5774bf62d3f6a1c0378cb5d2, p_938ec8b820fcfb75472dd51c.
- Exact output IDs reused across eligible comparisons: 549; example pair IDs: p_880f6448642a0a1b9a65ec20, p_7e6850942808a0e4d7fbaa8e.
- Identical visible implementation groups across output IDs: 271, covering 2597 outputs. Naming, comments, indentation and structure remain meaningful; AST equivalence is not used.
- Eligible task frequency range: 0–44; repeated tasks are intrinsic to the matched contrasts and ordinals. This is not a Formal sampling defect.
- Prior Play scheduler sampled one contrast uniformly, then an eligible pair with replacement. It prevented no pair, prompt, or code repeats. Formal assignments already exclude repeated pair IDs per review; they can repeat tasks or code, and overlap between independent reviewers is intentional.

## Play rules and exhaustion

Exclude invisible-equal pairs, then retain the first canonical occurrence of an unordered visible comparison within each task and contrast. Preserve meaningful formatting, comments, naming and structure. Select from unseen pair IDs, prefer no task or implementation reuse over 12 rounds (including the previous visit's recent window), balance the least-used available contrast, then randomize among candidates. If variety is impossible, relax the window oldest-first. No pair repeats until an explicit replay. A/B orientation uses independent random bits. Session history survives refresh; recent history survives returning visits. A full deterministic test traversal selected 883 unique pairs, with 7 task-window relaxations, and exhausted cleanly.

## Research integrity boundary

No exact-identical pair is eligible for Formal. Invisible-equal and repeated implementations are reported above, not retroactively filtered from completed Formal. No near-similarity threshold is asserted: semantically equivalent code can differ meaningfully in readability. Real saved Study databases are not queried or mutated by this audit. Historical exports/results are protected by unchanged analysis/export modules, frozen asset hashes, and isolated completed-fixture regression tests.

## Selection detail

- Removed from previous Play: 409 total = 5 invisible pairs + 404 repeated visible comparisons. Eligible repeated-comparison groups: 203; examples: p_d55887d28f07eff583309331, p_d669d3e314aa79a3171c41fe, p_6e9dc2681059fb7bc27ef74c, p_bf329a689d79ea37028c1d23; p_a46abef933389d2d11a877f2, p_876560753b02f5130c445cf8, p_5d5093b06fa10763109c87ab, p_8aa6bc7768b78392384b8769; p_43a460deb6b28a65848cc7dc, p_d58fa4cafa1ff1d2b064039b.
- Most frequent eligible tasks (before / curated Play): HumanEval/96: 44 / 38; HumanEval/57: 43 / 35; HumanEval/70: 43 / 38; HumanEval/79: 43 / 34; HumanEval/59: 42 / 40.
- Curated task frequency range: 0–40. These are exploratory availability counts, not a resampling of Formal.
- Historical evaluation-01 V1: 30 pairs, 30 tasks, 5 exact / 5 invisible equal; example equal IDs: p_1b514c9c570d58ff, p_2f664ecb543e78b3, p_ba2396e425764140, p_d7fc5f2bf7812fba. Recovery assets and scheduler retained unchanged.
- Historical evaluation-02 V1: 30 pairs, 30 tasks, 8 exact / 8 invisible equal; example equal IDs: p_25df32921132941b, p_275c8f54e6d24747, p_4ba9eff97c3cca8c, p_4c73dffcfd45e4d6. Recovery assets and scheduler retained unchanged.
