import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

APP = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('merge_results', APP / 'scripts/merge_results.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class MergeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pool = json.loads((APP / 'public/pools/evaluation-01-v1.json').read_text(encoding='utf-8'))
        cls.provenance = json.loads((APP / 'researcher/provenance-v1.json').read_text(encoding='utf-8'))
        assignments, responses = [], {}
        for i, pair in enumerate(cls.pool['pairs']):
            a = {'pairId': pair['pairId'], 'aCandidateId': pair['candidates'][0]['candidateId'], 'bCandidateId': pair['candidates'][1]['candidateId']}
            assignments.append(a)
            responses[pair['pairId']] = {**a, 'responseId': f'test-session:{pair["pairId"]}', 'sessionId': 'test-session', 'evaluatorId': 'unit-test-only', 'promptId': pair['promptId'], 'choice': ['A', 'B', 'tie', 'both_poor'][i % 4], 'reasons': ['Readability'], 'otherText': '', 'submittedAt': '2026-10-12T00:00:00.000Z'}
        cls.pilot = {'schemaVersion': 1, 'status': 'complete', 'session': {'schemaVersion': 1, 'appVersion': '1.0.0', 'mode': 'study', 'sessionId': 'test-session', 'evaluatorId': 'unit-test-only', 'poolId': cls.pool['poolId'], 'poolVersion': cls.pool['version'], 'poolHash': cls.provenance['poolHash'], 'protocolVersion': '1', 'seed': 123, 'randomizationVersion': 'mulberry32-fisher-yates-v1', 'createdAt': '2026-10-12T00:00:00.000Z', 'updatedAt': '2026-10-12T00:00:00.000Z', 'revision': 30, 'assignments': assignments, 'responses': responses}}

    def merge(self, *exports):
        qa = APP / 'qa'
        qa.mkdir(exist_ok=True)
        directory = Path(tempfile.mkdtemp(dir=qa))
        paths = []
        try:
            for i, data in enumerate(exports):
                p = Path(directory) / f'{i}.json'
                p.write_text(json.dumps(data), encoding='utf-8')
                paths.append(p)
            return module.merge(paths, self.pool, self.provenance)
        finally:
            for path in paths:
                path.unlink()
            directory.rmdir()

    def test_duplicate_backups_and_condition_join(self):
        sessions, rows = self.merge(self.pilot, self.pilot)
        self.assertEqual((len(sessions), len(rows)), (1, 30))
        for row in rows:
            self.assertEqual({row['aCondition'], row['bCondition']}, {'base', 'style-trained'})
            if row['choice'] in ('tie', 'both_poor'):
                self.assertEqual(row['preferredCondition'], row['choice'])

    def test_cumulative_partial_backup(self):
        partial = copy.deepcopy(self.pilot)
        partial['status'] = 'partial'
        partial['session']['responses'] = dict(list(partial['session']['responses'].items())[:2])
        partial['session']['draft'] = {'pairId': partial['session']['assignments'][2]['pairId']}
        sessions, rows = self.merge(partial, self.pilot)
        self.assertEqual(len(rows), 30)
        self.assertNotIn('draft', next(iter(sessions.values())))

    def test_conflicting_vote_fails(self):
        other = copy.deepcopy(self.pilot)
        first = next(iter(other['session']['responses'].values()))
        first['choice'] = 'B' if first['choice'] != 'B' else 'A'
        with self.assertRaisesRegex(ValueError, 'Conflicting response'):
            self.merge(self.pilot, other)

    def test_changed_pool_and_bad_mapping_fail(self):
        for field in ['poolHash', 'mapping']:
            other = copy.deepcopy(self.pilot)
            if field == 'poolHash':
                other['session']['poolHash'] = 'changed'
            else:
                other['session']['assignments'][0]['aCandidateId'] = 'unknown'
            with self.assertRaises(ValueError):
                self.merge(other)

    @unittest.skipUnless((APP / 'qa/pilot-result.csv').exists(), 'Run browser pilot to create actual downloads')
    def test_browser_csv_matches_actual_json_download(self):
        import csv
        pilot = json.loads((APP / 'qa/pilot-result.json').read_text(encoding='utf-8'))
        with (APP / 'qa/pilot-result.csv').open(newline='', encoding='utf-8') as f:
            rows = list(csv.DictReader(f))
        self.assertEqual(len(rows), 30)
        for row in rows:
            response = pilot['session']['responses'][row['pairId']]
            for key in ['sessionId', 'evaluatorId', 'aCandidateId', 'bCandidateId', 'choice', 'otherText', 'submittedAt']:
                self.assertEqual(row[key], response[key])
            self.assertEqual(json.loads(row['reasons']), response['reasons'])

if __name__ == '__main__':
    unittest.main()
