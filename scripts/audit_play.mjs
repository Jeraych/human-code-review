import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import {
  curatePlay,
  comparisonKey,
  visibleCode,
  newPlayHistory,
  selectPlay,
  rememberPlay,
} from '../src/playV2.ts';
const read = (name) =>
  JSON.parse(readFileSync(new URL('../public/v2/' + name, import.meta.url), 'utf8'));
const db = {
  ...read('catalog.json'),
  outputs: Object.fromEntries(
    ['B', 'C', 'S', 'J', 'SJ']
      .flatMap((c) => read(`outputs-${c}.json`))
      .map((o) => [o.outputId, o]),
  ),
};
const group = (items, key) => {
  const m = new Map();
  for (const p of items) {
    const k = key(p);
    m.set(k, [...(m.get(k) || []), p]);
  }
  return [...m.values()].filter((g) => g.length > 1);
};
const formal = db.pairs.filter((p) => p.eligible),
  play = curatePlay(db);
const same = db.pairs.filter((p) => db.outputs[p.left].code === db.outputs[p.right].code);
const invisible = db.pairs.filter(
  (p) => visibleCode(db.outputs[p.left].code) === visibleCode(db.outputs[p.right].code),
);
const duplicates = group(db.pairs, (p) => comparisonKey(p, db));
const outputUse = new Map();
for (const p of formal)
  for (const id of [p.left, p.right]) outputUse.set(id, [...(outputUse.get(id) || []), p.pairId]);
const codeGroups = group(Object.values(db.outputs), (o) => visibleCode(o.code));
let h = newPlayHistory(db),
  tasks = [],
  repeats = 0;
while (true) {
  const p = selectPlay(db, play, h, 'All contrasts', 0.37);
  if (!p) break;
  if (tasks.slice(-12).includes(p.taskId)) repeats++;
  tasks.push(p.taskId);
  h = rememberPlay(h, p);
}
const counts = {};
for (const c of ['B-C', 'C-S', 'C-J', 'S-SJ'])
  counts[c] = {
    catalog: db.pairs.filter((p) => p.contrast === c).length,
    formal: formal.filter((p) => p.contrast === c).length,
    play: play.filter((p) => p.contrast === c).length,
    exact: same.filter((p) => p.contrast === c).length,
    normalized: db.pairs.filter((p) => p.contrast === c && p.normalizedCodeMatch).length,
    invisible: invisible.filter((p) => p.contrast === c).length,
  };
const examples = (xs) =>
  xs
    .slice(0, 4)
    .map((p) => p.pairId)
    .join(', ') || 'none';
const report = `# Play pool audit (15 October 2026)\n\nRead-only audit of frozen canonical V2 data. No Formal catalog, assignments, responses, exports or analysis were edited. Historical V1 is retained as recovery and its scheduler is unchanged.\n\n| Contrast | Catalog | Formal / previous Play | Curated Play | Exact equal | Existing normalized equal | Invisible equal |\n|---|---:|---:|---:|---:|---:|---:|\n${Object.entries(
  counts,
)
  .map(
    ([c, v]) =>
      `| ${c} | ${v.catalog} | ${v.formal} | ${v.play} | ${v.exact} | ${v.normalized} | ${v.invisible} |`,
  )
  .join(
    '\n',
  )}\n\n- Catalog: ${db.pairs.length} comparisons across ${Object.keys(db.prompts).length} task prompts; ${formal.length} eligible Formal / previous Play pairs; ${play.length} curated Play pairs.\n- Exact identical sides: ${same.length}; examples: ${examples(same)}. Formal eligible exact identical: ${formal.filter((p) => same.includes(p)).length}.\n- Invisible equality (line endings, trailing space, edge blank lines only): ${invisible.length}; examples: ${examples(invisible)}. Eligible invisible: ${formal.filter((p) => invisible.includes(p)).length}; their pair IDs: ${formal
  .filter((p) => invisible.includes(p))
  .map((p) => p.pairId)
  .join(
    ', ',
  )}.\n- Catalog normalized flag: ${db.pairs.filter((p) => p.normalizedCodeMatch).length}. This is the original outer-whitespace-only provenance rule, retained unchanged.\n- Repeated unordered visible comparison groups within a task, across contrast/seed/ordinal: ${duplicates.length}, containing ${duplicates.reduce((n, g) => n + g.length, 0)} pairs; examples: ${duplicates
  .slice(0, 3)
  .map((g) => examples(g))
  .join(
    '; ',
  )}.\n- Exact output IDs reused across eligible comparisons: ${[...outputUse.values()].filter((g) => g.length > 1).length}; example pair IDs: ${[
  ...outputUse.values(),
]
  .find((g) => g.length > 1)
  ?.slice(0, 4)
  .join(
    ', ',
  )}.\n- Identical visible implementation groups across output IDs: ${codeGroups.length}, covering ${codeGroups.reduce((n, g) => n + g.length, 0)} outputs. Naming, comments, indentation and structure remain meaningful; AST equivalence is not used.\n- Eligible task frequency range: ${Math.min(...Object.keys(db.prompts).map((t) => formal.filter((p) => p.taskId === t).length))}–${Math.max(...Object.keys(db.prompts).map((t) => formal.filter((p) => p.taskId === t).length))}; repeated tasks are intrinsic to the matched contrasts and ordinals. This is not a Formal sampling defect.\n- Prior Play scheduler sampled one contrast uniformly, then an eligible pair with replacement. It prevented no pair, prompt, or code repeats. Formal assignments already exclude repeated pair IDs per review; they can repeat tasks or code, and overlap between independent reviewers is intentional.\n\n## Play rules and exhaustion\n\nExclude invisible-equal pairs, then retain the first canonical occurrence of an unordered visible comparison within each task and contrast. Preserve meaningful formatting, comments, naming and structure. Select from unseen pair IDs, prefer no task or implementation reuse over 12 rounds (including the previous visit's recent window), balance the least-used available contrast, then randomize among candidates. If variety is impossible, relax the window oldest-first. No pair repeats until an explicit replay. A/B orientation uses independent random bits. Session history survives refresh; recent history survives returning visits. A full deterministic test traversal selected ${h.seen.length} unique pairs, with ${repeats} task-window relaxations, and exhausted cleanly.\n\n## Research integrity boundary\n\nNo exact-identical pair is eligible for Formal. Invisible-equal and repeated implementations are reported above, not retroactively filtered from completed Formal. No near-similarity threshold is asserted: semantically equivalent code can differ meaningfully in readability. Real saved Study databases are not queried or mutated by this audit. Historical exports/results are protected by unchanged analysis/export modules, frozen asset hashes, and isolated completed-fixture regression tests.\n`;
const eligibleDuplicates = group(
  formal.filter((p) => !invisible.includes(p)),
  (p) => p.contrast + comparisonKey(p, db),
);
const taskCounts = Object.keys(db.prompts)
  .map((taskId) => ({
    taskId,
    before: formal.filter((p) => p.taskId === taskId).length,
    after: play.filter((p) => p.taskId === taskId).length,
  }))
  .sort((a, b) => b.before - a.before || a.taskId.localeCompare(b.taskId));
const historical = ['evaluation-01', 'evaluation-02'].map((id) => {
  const pool = JSON.parse(
    readFileSync(new URL('../public/pools/' + id + '-v1.json', import.meta.url), 'utf8'),
  );
  const exact = pool.pairs.filter((p) => p.candidates[0].code === p.candidates[1].code),
    visible = pool.pairs.filter(
      (p) => visibleCode(p.candidates[0].code) === visibleCode(p.candidates[1].code),
    );
  return `- Historical ${id} V1: ${pool.pairs.length} pairs, ${new Set(pool.pairs.map((p) => p.promptId)).size} tasks, ${exact.length} exact / ${visible.length} invisible equal; example equal IDs: ${examples(exact)}. Recovery assets and scheduler retained unchanged.`;
});
const extra = `\n## Selection detail\n\n- Removed from previous Play: ${formal.length - play.length} total = ${formal.filter((p) => invisible.includes(p)).length} invisible pairs + ${formal.length - play.length - formal.filter((p) => invisible.includes(p)).length} repeated visible comparisons. Eligible repeated-comparison groups: ${eligibleDuplicates.length}; examples: ${eligibleDuplicates
  .slice(0, 3)
  .map((g) => examples(g))
  .join('; ')}.\n- Most frequent eligible tasks (before / curated Play): ${taskCounts
  .slice(0, 5)
  .map((t) => `${t.taskId}: ${t.before} / ${t.after}`)
  .join(
    '; ',
  )}.\n- Curated task frequency range: ${Math.min(...taskCounts.map((t) => t.after))}–${Math.max(...taskCounts.map((t) => t.after))}. These are exploratory availability counts, not a resampling of Formal.\n${historical.join('\n')}\n`;
writeFileSync(new URL('../PLAY_POOL_AUDIT.md', import.meta.url), report + extra);
console.log(
  JSON.stringify(
    {
      counts,
      catalog: db.pairs.length,
      formal: formal.length,
      play: play.length,
      exact: same.length,
      invisible: invisible.length,
      duplicates: duplicates.length,
      rounds: h.seen.length,
      repeats,
    },
    null,
    2,
  ),
);
