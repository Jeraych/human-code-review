"""Build frozen assets from archived outputs. Never execute generated code or import train.py."""
import ast
import csv
import hashlib
import json
from pathlib import Path
import re
import subprocess

APP = Path(__file__).resolve().parents[1]
ROOT = APP.parent
REPO = ROOT / 'UnSloth-RL-heplus-fix'
PIN = '8cc4accd0c687a040543a791e472e3f5b236e2e2'

def digest(value):
    return hashlib.sha256(value.encode('utf-8') if isinstance(value, str) else value).hexdigest()

def write_frozen(path, value):
    text = json.dumps(value, ensure_ascii=False, indent=2) + '\n'
    if path.exists() and path.read_text(encoding='utf-8') != text:
        raise ValueError(f'Frozen file differs: {path}. Make a new pool version, never overwrite v1.')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8', newline='\n')

def build():
    snapshot = ROOT / 'UnSloth-RL/results/heplus_rows_0.json'
    dataset = json.loads(snapshot.read_text(encoding='utf-8'))
    prompts = {entry['row']['task_id']: entry['row']['prompt'] for entry in dataset['rows']}
    assert set(prompts) == {f'HumanEval/{i}' for i in range(100)}
    # Isolate the archived pure extraction function; do not run the trainer/module.
    source = subprocess.check_output(['git', '-C', str(REPO), 'show', f'{PIN}:train.py'], text=True, encoding='utf-8')
    node = next(n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name == 'extract_code')
    scope = {}
    exec(compile(ast.Module(body=[node], type_ignores=[]), '<archived-extraction-only>', 'exec'), scope)
    extract = scope['extract_code']
    selected = sorted(range(50, 100), key=lambda i: digest(f'human-code-evaluation-v1:{i}'))[:30]
    pairs, provenance, reveal, inputs, validation = [], {}, {}, {}, []
    for run, seed in [(33, 3407), (34, 3408), (35, 3409)]:
        run_dir = REPO / 'results' / str(run)
        tables, configs = {}, {}
        for condition, filename, logname in [('base', 'eval_base_holdout_tasks.csv', 'base_holdout.log'), ('style-trained', 'eval_lora_holdout_tasks.csv', 'lora_holdout.log')]:
            path = run_dir / filename
            inputs[str(path.relative_to(ROOT))] = digest(path.read_bytes())
            with path.open(encoding='utf-8', newline='') as f:
                records = list(csv.DictReader(f))
            keys = [(r['task_id'], int(r['generation_idx'])) for r in records]
            expected = {(f'HumanEval/{i}', g) for i in range(50, 100) for g in range(4)}
            assert len(keys) == len(set(keys)) == 200 and set(keys) == expected
            for r in records:
                assert int(r['item_idx']) == int(r['task_id'].split('/')[1]) - 50
                assert (extract(r['raw_completion']) or '') == r['extracted_code'], f'Extraction mismatch: {run}, {r["task_id"]}'
            tables[condition] = {k: r for k, r in zip(keys, records)}
            logpath = run_dir / logname
            log = logpath.read_text(encoding='utf-8')
            inputs[str(logpath.relative_to(ROOT))] = digest(logpath.read_bytes())
            assert f'seed={seed}' in log and 'style=1.0' in log and 'AI judge: enabled=False' in log
            assert 'use_chat_template=True, qwen_enable_thinking=False' in log
            configs[condition] = {
                'model': re.search(r'^MODEL_NAME=(.+)$', log, re.M)[1],
                'remoteAdapterPath': re.search(r'^LORA_PATH=(.+)$', log, re.M)[1] if condition != 'base' else None,
                'seed': seed, 'maxCompletionTokens': 384,
                'generation': {'doSample': True, 'temperature': 0.8, 'topP': 0.95},
                'checkpointHash': None,
            }
        # Corroborate snapshot task text against saved chat prompts (training tasks 0..9).
        sidecar = run_dir / 'before_after_code.csv'
        with sidecar.open(encoding='utf-8', newline='') as f:
            for row in csv.DictReader(f):
                assert prompts[row['task_id']] in row['prompt']
        inputs[str(sidecar.relative_to(ROOT))] = digest(sidecar.read_bytes())
        chosen = [i for pos, i in enumerate(selected) if pos % 3 == run - 33]
        validation.append({'run': run, 'seed': seed, 'validatedRowsPerCondition': 200, 'selectedTasks': chosen})
        for i in chosen:
            task = f'HumanEval/{i}'
            pair_id = 'p_' + digest(f'v1:{run}:{task}:0')[:16]
            candidates = []
            for condition in ['base', 'style-trained']:
                row = tables[condition][(task, 0)]
                candidate_id = 'c_' + digest(f'v1:{run}:{task}:0:{condition}')[:20]
                candidates.append({'candidateId': candidate_id, 'code': row['extracted_code']})
                provenance[candidate_id] = {
                    'condition': condition, 'run': run, 'taskId': task, 'generationIndex': 0,
                    'sourceFile': f'UnSloth-RL-heplus-fix/results/{run}/' + ('eval_base_holdout_tasks.csv' if condition == 'base' else 'eval_lora_holdout_tasks.csv'),
                    'sourceConfig': configs[condition], 'rawCompletion': row['raw_completion'],
                    'rawSha256': digest(row['raw_completion']), 'displayedSha256': digest(row['extracted_code']),
                    'automatedTestStatus': row['test_status'], 'styleStatus': row['style_status'],
                }
                reveal[candidate_id] = 'Base' if condition == 'base' else 'Style-trained'
            pairs.append({'pairId': pair_id, 'promptId': 't_' + digest(task)[:16], 'promptText': prompts[task], 'language': 'python', 'candidates': sorted(candidates, key=lambda c: c['candidateId'])})
    pool = {'schemaVersion': 1, 'poolId': 'evaluation-01', 'version': '1', 'protocolVersion': '1', 'pairs': sorted(pairs, key=lambda p: p['pairId'])}
    # Compact serialization is the common Python/browser hash contract. Field order is preserved.
    pool_hash = digest(json.dumps(pool, ensure_ascii=False, separators=(',', ':')))
    inputs[str(snapshot.relative_to(ROOT))] = digest(snapshot.read_bytes())
    write_frozen(APP / 'public/pools/evaluation-01-v1.json', pool)
    write_frozen(APP / 'public/play/evaluation-01-v1.json', {'poolHash': pool_hash, 'labels': reveal})
    write_frozen(APP / 'researcher/provenance-v1.json', {
        'poolHash': pool_hash, 'sourceCommit': PIN, 'inputsSha256': inputs,
        'dataset': {'name': 'evalplus/humanevalplus', 'split': 'test', 'revision': None, 'snapshot': str(snapshot.relative_to(ROOT))},
        'extractionFunctionSha256': digest(ast.get_source_segment(source, node)),
        'validation': validation, 'candidates': provenance,
        'limitations': ['Historical dataset revision and checkpoint binary hashes are unavailable.', 'Prompt snapshot corroborated with saved training-task chat prompts, not complete holdout chat prompts.', 'Run 35 recorded 70 training test timeouts; included without filtering.'],
    })
    print(f'Frozen {len(pairs)} pairs, 10 per seed; validated 1200 source rows; pool SHA-256 {pool_hash}')

if __name__ == '__main__':
    build()
