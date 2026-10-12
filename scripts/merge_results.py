"""Validate exports and join opaque candidates to researcher conditions. Standard library only."""
import argparse
import csv
import hashlib
import json
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
REASONS = {'Readability', 'Naming', 'Structure', 'Simplicity', 'Maintainability', 'Comments', 'Robustness', 'Other'}

def merge(paths, pool, provenance):
    pool_hash = hashlib.sha256(json.dumps(pool, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
    if provenance['poolHash'] != pool_hash:
        raise ValueError('Provenance does not match pool')
    pairs = {p['pairId']: p for p in pool['pairs']}
    sessions = {}
    for path in paths:
        data = json.loads(path.read_text(encoding='utf-8'))
        s = data['session']
        if data['schemaVersion'] != 1 or s['schemaVersion'] != 1 or s['mode'] != 'study':
            raise ValueError(f'Unsupported export: {path}')
        if (s['poolId'], s['poolVersion'], s['poolHash'], s['protocolVersion']) != (pool['poolId'], pool['version'], pool_hash, pool['protocolVersion']):
            raise ValueError(f'Pool mismatch: {path}')
        assignments = {a['pairId']: a for a in s['assignments']}
        if len(assignments) != len(s['assignments']) or set(assignments) != set(pairs):
            raise ValueError(f'Incomplete/duplicate schedule: {path}')
        for pair_id, a in assignments.items():
            if a['aCandidateId'] == a['bCandidateId'] or {a['aCandidateId'], a['bCandidateId']} != {c['candidateId'] for c in pairs[pair_id]['candidates']}:
                raise ValueError(f'Invalid assignment: {path}, {pair_id}')
        for pair_id, r in s['responses'].items():
            a = assignments.get(pair_id)
            if not a or any(r.get(k) != a[k] for k in ['pairId', 'aCandidateId', 'bCandidateId']):
                raise ValueError(f'Invalid response mapping: {path}')
            if r['responseId'] != f'{s["sessionId"]}:{pair_id}' or r['sessionId'] != s['sessionId'] or r['evaluatorId'] != s['evaluatorId'] or r['promptId'] != pairs[pair_id]['promptId']:
                raise ValueError(f'Invalid response identity: {path}')
            if r['choice'] not in {'A', 'B', 'tie', 'both_poor'} or not isinstance(r['reasons'], list) or len(set(r['reasons'])) != len(r['reasons']) or not set(r['reasons']) <= REASONS or not isinstance(r['otherText'], str) or len(r['otherText']) > 500 or ('Other' not in r['reasons'] and r['otherText']):
                raise ValueError(f'Invalid vote: {path}')
        expected_status = 'complete' if len(s['responses']) == len(assignments) else 'partial'
        if data['status'] != expected_status:
            raise ValueError(f'Completion status mismatch: {path}')
        old = sessions.get(s['sessionId'])
        if old:
            stable = ['schemaVersion', 'appVersion', 'randomizationVersion', 'evaluatorId', 'poolId', 'poolVersion', 'poolHash', 'protocolVersion', 'seed', 'createdAt', 'assignments', 'priorPlayExposure']
            if any(old.get(k) != s.get(k) for k in stable):
                raise ValueError(f'Conflicting session: {s["sessionId"]}')
            for pair_id, response in s['responses'].items():
                if pair_id in old['responses'] and old['responses'][pair_id] != response:
                    raise ValueError(f'Conflicting response: {s["sessionId"]}, {pair_id}')
            old['responses'].update(s['responses'])
            old['updatedAt'] = max(old['updatedAt'], s['updatedAt'])
            old['revision'] = max(old['revision'], s['revision'])
            old.pop('draft', None)
        else:
            sessions[s['sessionId']] = s
    rows = []
    for s in sessions.values():
        for a in s['assignments']:
            r = s['responses'].get(a['pairId'])
            if r is None:
                continue
            ca, cb = (provenance['candidates'][r[k]] for k in ['aCandidateId', 'bCandidateId'])
            preferred = ca['condition'] if r['choice'] == 'A' else cb['condition'] if r['choice'] == 'B' else r['choice']
            rows.append({
                'sessionId': s['sessionId'], 'evaluatorId': s['evaluatorId'], 'poolId': s['poolId'], 'poolVersion': s['poolVersion'], 'poolHash': pool_hash,
                'pairId': a['pairId'], 'promptId': r['promptId'], 'taskId': ca['taskId'], 'aRun': ca['run'], 'bRun': cb['run'],
                'aCandidateId': r['aCandidateId'], 'bCandidateId': r['bCandidateId'], 'aCondition': ca['condition'], 'bCondition': cb['condition'],
                'choice': r['choice'], 'preferredCondition': preferred, 'reasons': json.dumps(r['reasons']), 'otherText': r['otherText'], 'submittedAt': r['submittedAt'],
                'priorPlayExposure': s.get('priorPlayExposure', False),
            })
    return sessions, rows

def safe_cell(value):
    text = str(value)
    return "'" + text if text.lstrip().startswith(('=', '+', '-', '@')) or text.startswith(('\t', '\r', '\n')) else value

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('exports', nargs='+', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--condition', choices=['style', 'judge'], default='style')
    parser.add_argument('--pool', type=Path)
    parser.add_argument('--provenance', type=Path)
    args = parser.parse_args()
    if args.pool is None:
        args.pool = APP / f'public/pools/evaluation-0{1 if args.condition == "style" else 2}-v1.json'
    if args.provenance is None:
        args.provenance = APP / ('researcher/provenance-v1.json' if args.condition == 'style' else 'researcher/judge-provenance-v1.json')
    pool, provenance = (json.loads(p.read_text(encoding='utf-8')) for p in [args.pool, args.provenance])
    sessions, rows = merge(args.exports, pool, provenance)
    args.out.mkdir(parents=True, exist_ok=True)
    targets = [args.out / 'merged.json', args.out / 'merged.csv']
    if any(p.exists() for p in targets):
        raise ValueError('Output already exists. Choose a new output directory to preserve the previous merge.')
    targets[0].write_text(json.dumps({'schemaVersion': 1, 'poolHash': provenance['poolHash'], 'sessions': list(sessions.values()), 'responses': rows}, ensure_ascii=False, indent=2), encoding='utf-8')
    with targets[1].open('w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]) if rows else ['sessionId', 'pairId', 'choice'])
        writer.writeheader()
        writer.writerows({k: safe_cell(v) for k, v in row.items()} for row in rows)
    counts = {}
    for s in sessions.values():
        counts[s['evaluatorId']] = counts.get(s['evaluatorId'], 0) + 1
    print(f'Merged {len(rows)} responses from {len(sessions)} sessions. Exact duplicates removed; disagreements fail closed.')
    if any(n > 1 for n in counts.values()):
        print('Review repeated evaluator IDs across sessions:', {k:v for k,v in counts.items() if v > 1})

if __name__ == '__main__':
    main()
