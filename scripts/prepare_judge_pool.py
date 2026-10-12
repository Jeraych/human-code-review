"""Match formal Judge runs 36-38 to the unchanged Style task/seed/generation selection."""
import ast
import csv
import json
from pathlib import Path
import subprocess
from prepare_pools import APP, ROOT, REPO, PIN, digest, write_frozen

def require(ok, message):
    if not ok:
        raise ValueError(message)

def build():
    style_path = APP / 'public/pools/evaluation-01-v1.json'
    style = json.loads(style_path.read_text(encoding='utf-8'))
    style_provenance = json.loads((APP / 'researcher/provenance-v1.json').read_text(encoding='utf-8'))
    source = subprocess.check_output(['git', '-C', str(REPO), 'show', f'{PIN}:train.py'], text=True, encoding='utf-8')
    node = next(n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name == 'extract_code')
    scope = {}
    exec(compile(ast.Module(body=[node], type_ignores=[]), '<pure-extraction-only>', 'exec'), scope)
    extract = scope['extract_code']
    pairs, candidates, labels, inputs, validation = [], {}, {}, {}, []
    common_hashes = None
    required_settings = {'MODEL_NAME': 'unsloth/Qwen3.6-27B', 'DATASET_NAME': 'evalplus/humanevalplus', 'DATASET_SPLIT': 'test', 'HOLDOUT_TASK_START': '50', 'HOLDOUT_TASK_END': '100', 'EVAL_NUM_GENERATIONS': '4', 'MAX_PROMPT_LENGTH': '1024', 'MAX_COMPLETION_LENGTH': '384', 'USE_CHAT_TEMPLATE': '1', 'QWEN_ENABLE_THINKING': '0', 'AI_JUDGE_ENABLED': '1', 'REWARD_STYLE_WEIGHT': '0.0', 'REWARD_AI_JUDGE_WEIGHT': '1.0', 'MAX_STEPS': '500', 'AUTO_RESUME': '0', 'RESUME_FROM_CHECKPOINT': 'none'}
    required_settings.update({'REWARD_TESTS_WEIGHT': '4.5', 'REWARD_FORMAT_WEIGHT': '0.1', 'REWARD_SYNTAX_WEIGHT': '0.1', 'REWARD_COMPILE_WEIGHT': '0.3', 'PERFORMANCE_ENABLED': '0', 'REWARD_PERFORMANCE_WEIGHT': '0.0', 'LOAD_IN_4BIT': '1', 'LORA_RANK': '16', 'LORA_ALPHA': '16', 'TRAIN_TASK_START': '0', 'TRAIN_TASK_END': '50'})
    for run, seed in [(36, 3407), (37, 3408), (38, 3409)]:
        directory = REPO / 'results' / str(run)
        meta_path, health_path = directory / 'metadata.json', directory / 'health.json'
        meta = json.loads(meta_path.read_text(encoding='utf-8'))
        health = json.loads(health_path.read_text(encoding='utf-8'))
        summary_path = directory / 'judge-summary.json'
        summary = json.loads(summary_path.read_text(encoding='utf-8'))
        require(meta['mode'] == 'formal' and meta['status'] == 'completed' and meta['seed'] == seed, f'Nonformal/incomplete/wrong seed: {run}')
        require(health['pass'] is True and all(v is True for v in health['checks'].values()) and health['groups'] == 500, f'Health gate failed: {run}')
        require(not summary['errors_by_kind'], f'Judge errors: {run}')
        require(meta['baseline'] == PIN and meta['prompt']['historical_hash'] == '50d083c5e7100d2e', f'Instrument mismatch: {run}')
        if common_hashes is None:
            common_hashes = meta['source_hashes']
        require(meta['source_hashes'] == common_hashes, 'Formal sources differ across seeds')
        require(all(s['exit_code'] == 0 for s in meta['stage_results']), 'Failed stage')
        require({s['stage'] for s in meta['stage_results']} == {'train', 'eval_lora', 'eval_lora_holdout'}, 'Unexpected formal stage set')
        settings = meta['stages']['eval_lora_holdout']
        require(all(settings[k] == v for k, v in required_settings.items()) and settings['SEED'] == str(seed), f'Evaluation configuration mismatch: {run}')
        require(all(meta['stages']['train'][k] == v for k, v in required_settings.items()) and meta['stages']['train']['SEED'] == str(seed), f'Training configuration mismatch: {run}')
        csv_path = directory / 'logs/eval_lora_holdout/eval_lora_holdout_tasks.csv'
        with csv_path.open(encoding='utf-8', newline='') as f:
            records = list(csv.DictReader(f))
        keys = [(r['task_id'], int(r['generation_idx'])) for r in records]
        expected = {(f'HumanEval/{i}', g) for i in range(50, 100) for g in range(4)}
        require(len(keys) == len(set(keys)) == 200 and set(keys) == expected, f'Pairing coverage failed: {run}')
        for r in records:
            require(int(r['item_idx']) == int(r['task_id'].split('/')[1]) - 50, 'Task ordering mismatch')
            require(r['extracted_code'] and extract(r['raw_completion']) == r['extracted_code'], f'Incomplete/extraction mismatch: {run}, {r["task_id"]}')
        table = dict(zip(keys, records))
        for path in [meta_path, health_path, summary_path, csv_path]:
            inputs[str(path.relative_to(ROOT))] = digest(path.read_bytes())
        chosen = []
        for original in style['pairs']:
            base = next(c for c in original['candidates'] if style_provenance['candidates'][c['candidateId']]['condition'] == 'base')
            base_meta = style_provenance['candidates'][base['candidateId']]
            if base_meta['sourceConfig']['seed'] != seed:
                continue
            require(base_meta['generationIndex'] == 0 and base_meta['sourceConfig']['model'] == settings['MODEL_NAME'] and base_meta['sourceConfig']['maxCompletionTokens'] == int(settings['MAX_COMPLETION_LENGTH']), 'Reference mismatch')
            # Re-read the recorded reference CSV to ensure the frozen Base has not drifted.
            base_source = ROOT / base_meta['sourceFile']
            with base_source.open(encoding='utf-8', newline='') as f:
                references = [r for r in csv.DictReader(f) if r['task_id'] == base_meta['taskId'] and r['generation_idx'] == '0']
            require(len(references) == 1 and references[0]['extracted_code'] == base['code'] and digest(references[0]['raw_completion']) == base_meta['rawSha256'], 'Archived Base reference changed')
            inputs[str(base_source.relative_to(ROOT))] = digest(base_source.read_bytes())
            task = base_meta['taskId']
            row = table[(task, 0)]
            chosen.append(task)
            candidate_id = 'c_' + digest(f'judge-v1:{run}:{task}:0')[:20]
            pairs.append({'pairId': 'p_' + digest(f'judge-v1:{run}:{task}:0')[:16], 'promptId': original['promptId'], 'promptText': original['promptText'], 'language': original['language'], 'candidates': sorted([base, {'candidateId': candidate_id, 'code': row['extracted_code']}], key=lambda c: c['candidateId'])})
            candidates[base['candidateId']] = {**base_meta, 'referenceRole': 'unchanged archived common Base from Style pool; not generated in Judge run'}
            candidates[candidate_id] = {
                'condition': 'judge-trained', 'run': run, 'taskId': task, 'generationIndex': 0,
                'sourceFile': str(csv_path.relative_to(ROOT)), 'sourceConfig': {'seed': seed, 'model': settings['MODEL_NAME'], 'maxCompletionTokens': 384, 'generation': {'doSample': True, 'temperature': 0.8, 'topP': 0.95}, 'generationSettingsEvidence': 'same archived generation function defaults; formal metadata confirms model, token limit, seed, four generations and chat settings', 'checkpointHash': None},
                'sourceCommit': meta['git_commit'], 'recordedRuntimeHashes': meta['source_hashes'], 'judgeInstrument': meta['prompt'], 'recordedBackend': meta['recorded_backend'],
                'rawCompletion': row['raw_completion'], 'rawSha256': digest(row['raw_completion']), 'displayedSha256': digest(row['extracted_code']), 'syntaxStatus': row['syntax_status'], 'completionTokenLength': int(row['completion_token_length']),
            }
            labels[base['candidateId']] = 'Base'
            labels[candidate_id] = 'Judge-trained'
        require(len(chosen) == 10, 'Seed allocation differs from frozen Style')
        validation.append({'run': run, 'seed': seed, 'healthPassed': True, 'sourceRows': 200, 'selectedTasks': sorted(chosen), 'nonemptyExtractedCode': len(records), 'syntaxErrorsRetained': sum(r['syntax_status'] != 'ok' for r in records), 'baseReferenceRun': run - 3})
    pool = {'schemaVersion': 1, 'poolId': 'evaluation-02', 'version': '1', 'protocolVersion': '1', 'pairs': sorted(pairs, key=lambda p: p['pairId'])}
    pool_hash = digest(json.dumps(pool, ensure_ascii=False, separators=(',', ':')))
    require(len(pool['pairs']) == 30 and {p['promptId'] for p in pool['pairs']} == {p['promptId'] for p in style['pairs']}, 'Task selection changed')
    write_frozen(APP / 'public/pools/evaluation-02-v1.json', pool)
    write_frozen(APP / 'public/play/evaluation-02-v1.json', {'poolHash': pool_hash, 'labels': labels})
    write_frozen(APP / 'researcher/judge-provenance-v1.json', {'poolHash': pool_hash, 'matchedStylePoolHash': style_provenance['poolHash'], 'selectionRule': 'Exactly the frozen Style task/seed assignment and generation 0; shared archived Base candidates.', 'inputsSha256': inputs, 'validation': validation, 'candidates': candidates, 'limitations': ['Judge runs contain no eval_base or eval_base_holdout stages; archival same-seed Base from runs 33-35 is reused without regeneration.', 'Executed remote runtime hashes are recorded, but the corresponding exact remote source snapshot is not locally available; local formal generation/prompt/extraction function ASTs agree with the archived common source.', 'Historical dataset revision and checkpoint binary hashes remain unavailable.', 'Same tasks/prompt text and common Base make comparisons directly matched at display level, not a simultaneous regenerated Base control.', 'Poor/truncated/syntax-invalid generations are retained; preference is not verified correctness.']})
    print(f'Judge: 600 formal outputs validated, 30 pairs with identical Style tasks/seeds/generation and common Base. SHA-256 {pool_hash}')
    print('Source diagnostics:', json.dumps(validation))

if __name__ == '__main__':
    build()
