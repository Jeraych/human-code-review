"""Freeze V2 from real archived holdout CSVs. Never run generated programs or models."""
import csv
import hashlib
import io
import json
from pathlib import Path
import tarfile
from prepare_pools import write_frozen

APP = Path(__file__).resolve().parents[1]
ROOT = APP.parent
RUNS = ROOT / 'UnSloth-RL-heplus-fix/results'
CONTRASTS = [('B', 'C'), ('C', 'S'), ('C', 'J'), ('S', 'SJ')]

def sha(data):
    return hashlib.sha256(data.encode() if isinstance(data, str) else data).hexdigest()

def formal_configuration(cfg, seed, style):
    expected = {'MODEL_NAME': 'unsloth/Qwen3.6-27B', 'LOAD_IN_4BIT': '1', 'LORA_RANK': '16',
        'LORA_ALPHA': '16', 'LORA_DROPOUT': '0', 'LORA_TARGET_MODULES': 'all-linear',
        'DATASET_NAME': 'evalplus/humanevalplus', 'DATASET_SPLIT': 'test', 'SEED': str(seed),
        'MAX_STEPS': '500', 'NUM_GENERATIONS': '4', 'TRAIN_TASK_START': '0', 'TRAIN_TASK_END': '50',
        'HOLDOUT_TASK_START': '50', 'HOLDOUT_TASK_END': '100', 'REWARD_FORMAT_WEIGHT': '0.1',
        'REWARD_SYNTAX_WEIGHT': '0.1', 'REWARD_COMPILE_WEIGHT': '0.3', 'REWARD_TESTS_WEIGHT': '4.5',
        'REWARD_STYLE_WEIGHT': style, 'REWARD_AI_JUDGE_WEIGHT': '1.0', 'AI_JUDGE_ENABLED': '1',
        'AI_JUDGE_REQUIRE_TEST_PASS': '1', 'REWARD_PERFORMANCE_WEIGHT': '0.0'}
    for key, value in expected.items():
        assert cfg[key] == value, (key, cfg[key], value)

def build():
    snapshot = ROOT / 'UnSloth-RL/results/heplus_rows_0.json'
    prompts = {r['row']['task_id']: r['row']['prompt'] for r in json.loads(snapshot.read_text(encoding='utf-8'))['rows']}
    inputs = {str(snapshot.relative_to(ROOT)): sha(snapshot.read_bytes())}
    outputs, tables, evidence = {}, {}, []
    archive = ROOT / 'combined_39_41_review.tar.gz'
    with tarfile.open(archive) as tar:
        members = tar.getnames()
        for condition, first in [('B', 33), ('C', 30), ('S', 33), ('J', 36), ('SJ', 39)]:
            records = []
            for offset, seed in enumerate([3407, 3408, 3409]):
                run = first + offset
                filename = 'eval_base_holdout_tasks.csv' if condition == 'B' else 'eval_lora_holdout_tasks.csv'
                if condition == 'SJ':
                    metas = [n for n in members if n.endswith('/metadata.json')]
                    candidates = [(n, json.load(tar.extractfile(n))) for n in metas]
                    found = [(n, m) for n, m in candidates if m.get('run_number') == run and m.get('seed') == seed]
                    if len(found) != 1:
                        raise ValueError(f'Missing/ambiguous real Combined metadata run {run}')
                    meta_name, meta = found[0]
                    name = meta_name.rsplit('/', 1)[0] + '/logs/eval_lora_holdout/' + filename
                    raw = tar.extractfile(name).read()
                    source = archive.name + '::' + name
                    cfg = meta['configuration']
                    formal_configuration(cfg, seed, '1.0')
                    assert meta['status'] == 'completed' and meta['mode'] == 'formal'
                    assert cfg['SEED'] == str(seed) and cfg['REWARD_STYLE_WEIGHT'] == '1.0'
                    assert cfg['REWARD_AI_JUDGE_WEIGHT'] == '1.0' and cfg['AI_JUDGE_REQUIRE_TEST_PASS'] == '1'
                    for k, v in {'MODEL_NAME': 'unsloth/Qwen3.6-27B', 'LORA_RANK': '16', 'LORA_ALPHA': '16', 'LORA_DROPOUT': '0', 'LORA_TARGET_MODULES': 'all-linear', 'MAX_STEPS': '500', 'NUM_GENERATIONS': '4', 'TRAIN_TASK_START': '0', 'TRAIN_TASK_END': '50', 'HOLDOUT_TASK_START': '50', 'HOLDOUT_TASK_END': '100'}.items():
                        assert cfg[k] == v, (run, k)
                    inputs[archive.name + '::' + meta_name] = sha(tar.extractfile(meta_name).read())
                    evidence.append({'condition': condition, 'run': run, 'seed': seed, 'metadata': meta, 'health': json.load(tar.extractfile(meta_name.rsplit('/', 1)[0] + '/health.json'))})
                    assert evidence[-1]['health']['pass']
                else:
                    path = RUNS / str(run) / ('logs/eval_lora_holdout' if condition == 'J' else '') / filename
                    if not path.exists():
                        path = path.with_name(path.stem + '_1.csv')
                    raw = path.read_bytes()
                    source = str(path.relative_to(ROOT)).replace('\\', '/')
                    if condition == 'J':
                        meta_path = RUNS / str(run) / 'metadata.json'
                        meta = json.loads(meta_path.read_text(encoding='utf-8'))
                        assert meta['seed'] == seed and meta['status'] == 'completed'
                        assert meta['mode'] == 'formal'
                        formal_configuration(meta['configuration'], seed, '0.0')
                        health = json.loads((RUNS / str(run) / 'health.json').read_text(encoding='utf-8'))
                        assert health['pass']
                        evidence.append({'condition': condition, 'run': run, 'metadata': meta, 'health': health})
                        inputs[str(meta_path.relative_to(ROOT))] = sha(meta_path.read_bytes())
                    else:
                        log_path = RUNS / str(run) / ('base_holdout.log' if condition == 'B' else 'lora_holdout.log')
                        if not log_path.exists():
                            log_path = log_path.with_name(log_path.stem + '_1.log')
                        log = log_path.read_text(encoding='utf-8')
                        assert f'seed={seed}' in log and 'MODEL_NAME=unsloth/Qwen3.6-27B' in log
                        assert 'rank=16, alpha=16, dropout=0.0, target_modules=all-linear' in log
                        assert 'load_in_4bit=True' in log and 'num_generations=4' in log and 'max_steps=500' in log
                        assert 'AI judge: enabled=False' in log
                        if condition != 'B':
                            style = '0.0' if condition == 'C' else '1.0'
                            assert f'format=0.1, syntax=0.1, compile=0.3, style={style}, tests=4.5' in log
                            assert 'profile=baseline' in log
                        inputs[str(log_path.relative_to(ROOT))] = sha(log_path.read_bytes())
                        evidence.append({'condition': condition, 'run': run, 'seed': seed, 'log': str(log_path.relative_to(ROOT))})
                inputs[source] = sha(raw)
                rows = list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))
                keys = [(r['task_id'], int(r['generation_idx'])) for r in rows]
                assert len(keys) == len(set(keys)) == 200
                assert set(keys) == {(f'HumanEval/{i}', g) for i in range(50, 100) for g in range(4)}
                for row_number, row in enumerate(rows, 2):
                    task, ordinal = row['task_id'], int(row['generation_idx'])
                    assert int(row['item_idx']) == int(task.split('/')[1]) - 50
                    code = row['extracted_code']
                    identity = f'{condition}:{run}:{seed}:{task}:{ordinal}:{sha(raw)}:{sha(code)}'
                    output = {'outputId': 'o_' + sha(identity)[:24], 'condition': condition, 'run': run, 'seed': seed,
                        'taskId': task, 'ordinal': ordinal, 'sourceFile': source, 'sourceRow': row_number,
                        'sourceKey': [task, ordinal], 'sourceHash': sha(raw), 'code': code, 'codeHash': sha(code),
                        'rawHash': sha(row['raw_completion']), 'testStatus': row['test_status'],
                        'runtimeStatus': row.get('runtime_status'), 'syntaxStatus': row.get('syntax_status'),
                        'error': row.get('test_error_message') or row.get('error_message') or None,
                        'ruffStatus': row.get('style_status'), 'ruffViolations': int(row.get('style_violation_count') or 0),
                        'ruffScore': float(row['style_score']) if row.get('style_score') else None,
                        'judgeStatus': row.get('ai_judge_status'), 'judgeScore': float(row['ai_judge_score']) if row.get('ai_judge_score') else None}
                    records.append(output)
            outputs[condition] = records
            tables[condition] = {(r['seed'], r['taskId'], r['ordinal']): r for r in records}
            write_frozen(APP / f'public/v2/outputs-{condition}.json', records)
    pairs, stats = [], {}
    for left, right in CONTRASTS:
        contrast = f'{left}-{right}'
        counts = {'matched': 0, 'bothCorrect': 0, 'exactIdentical': 0, 'bothCorrectIdentical': 0, 'eligible': 0}
        for key in sorted(tables[left]):
            a, b = tables[left][key], tables[right][key]
            same = a['code'] == b['code']
            correct = a['testStatus'] == b['testStatus'] == 'passed'
            eligible = correct and not same and bool(a['code'].strip() and b['code'].strip())
            counts['matched'] += 1
            counts['bothCorrect'] += correct
            counts['exactIdentical'] += same
            counts['bothCorrectIdentical'] += correct and same
            counts['eligible'] += eligible
            pairs.append({'pairId': 'p_' + sha('v2:' + a['outputId'] + ':' + b['outputId'])[:24],
                'contrast': contrast, 'taskId': key[1], 'seed': key[0], 'ordinal': key[2],
                'left': a['outputId'], 'right': b['outputId'], 'exactCodeMatch': same,
                'normalizedCodeMatch': a['code'].strip() == b['code'].strip(), 'bothCorrect': correct, 'eligible': eligible})
        counts['duplicateRate'] = counts['exactIdentical'] / counts['matched']
        counts['eligibleDuplicateRate'] = counts['bothCorrectIdentical'] / counts['bothCorrect'] if counts['bothCorrect'] else None
        stats[contrast] = counts
    aggregates = {}
    for condition in ['C', 'S', 'J', 'SJ']:
        rows = outputs[condition]
        clean = lambda r: r['ruffStatus'] == 'ok' and r['ruffViolations'] == 0
        aggregates[condition] = {'n': len(rows), 'correct': sum(r['testStatus'] == 'passed' for r in rows),
            'ruffClean': sum(clean(r) for r in rows), 'correctAndClean': sum(r['testStatus'] == 'passed' and clean(r) for r in rows)}
    limitations = ['Archived Base runs 33-35 reused; no regenerated Base.', 'Task/seed/ordinal matching does not prove common RNG draws.', 'Run 35: 70/2000 training correctness timeouts, mainly tasks 15/39; diagnostic caching reused some timeout outcomes; original trigger unresolved.', 'Historical dataset revision and checkpoint hashes unavailable; source records and code hashes retained.']
    catalog = {'schemaVersion': 2, 'protocolVersion': 'human-validation-v2', 'poolVersion': 'formal-v2',
        'playPoolVersion': 'play-v2', 'prompts': {k: v for k, v in prompts.items() if int(k.split('/')[1]) >= 50},
        'pairs': pairs, 'stats': stats, 'aggregates': aggregates, 'limitations': limitations}
    catalog['catalogHash'] = sha(json.dumps(catalog, ensure_ascii=False, separators=(',', ':')))
    write_frozen(APP / 'public/v2/catalog.json', catalog)
    write_frozen(APP / 'researcher/provenance-v2.json', {'catalogHash': catalog['catalogHash'], 'inputsSha256': inputs, 'evidence': evidence, 'limitations': limitations})
    print(json.dumps({'stats': stats, 'aggregates': aggregates, 'catalogHash': catalog['catalogHash']}, indent=2))

if __name__ == '__main__':
    build()

