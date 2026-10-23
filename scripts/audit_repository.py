"""Audit versioned files/history before publication; print paths/categories, never secret values."""
import json
from pathlib import Path
import re
import subprocess
import sys

APP = Path(__file__).resolve().parents[1]
def git(*args):
    return subprocess.check_output(['git', '-C', str(APP), *args])

SECRET_PATTERNS = [
    ('GitHub token', rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})'),
    ('OpenAI-like key', rb'sk-(?:proj-|org-)?[A-Za-z0-9_-]{30,}'),
    ('AWS access key', rb'(?:AKIA|ASIA)[A-Z0-9]{16}'),
    ('Private key', rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    ('Credential in URL', rb'https?://[^\s/"<>]+:[^\s/"<>]+@'),
    ('Literal secret assignment', rb'(?i)(?:api[_-]?key|access[_-]?token|auth[_-]?token|password)\s*[:=]\s*[\x22\x27][A-Za-z0-9_/-]{16,}[\x22\x27]'),
]
BLOCKED = re.compile(r'(^|/)(\.env(?:\..*)?|\.npmrc|node_modules|dist|qa|\.runtime|\.idea|\.vscode|participant-results|exports|responses|results|checkpoints|adapters)(/|$)|\.(?:safetensors|pt|pth|ckpt|pem|p12|pfx|sqlite(?:3)?(?:-.*)?|db(?:-.*)?)$|(^|/)(?:code-choice-.*\.(?:json|csv)|.*\.study\.json|.*-result\.json|v2-.*-backup\.json|v2-unreadable-cache\.json)$')

def inspect(path, data):
    findings = []
    # The only environment file allowed is a reviewed, non-secret template.
    if path != '.env.example' and BLOCKED.search(path):
        findings.append({'path': path, 'category': 'private or generated artifact'})
    if re.search(r'(^|/)(?:human-validation-.*-backup\.json|play-v2-exploratory\.json)$', path):
        findings.append({'path': path, 'category': 'private response export'})
    if data.startswith(b'SQLite format 3\0'):
        findings.append({'path': path, 'category': 'SQLite database content'})
    for category, pattern in SECRET_PATTERNS:
        if re.search(pattern, data): findings.append({'path': path, 'category': category})
    if path.endswith('.json'):
        try:
            value = json.loads(data)
        except (ValueError, UnicodeError):
            value = None
        if isinstance(value, dict) and (
            ('responses' in value and ('assignments' in value or 'reviewer' in value))
            or ('protocol' in value and ('analysis' in value or 'sources' in value))
        ):
            findings.append({'path': path, 'category': 'possible Study response export'})
    return findings

def main():
    findings, sizes, entries, blobs = [], [], set(), {}
    commits = git('rev-list', '--all').decode().splitlines()
    # Check every historical path, including the same blob under different names.
    for commit in commits:
        for entry in filter(None, git('ls-tree', '-rz', commit).split(b'\0')):
            metadata, name = entry.split(b'\t', 1)
            _, kind, sha = metadata.decode().split()
            if kind == 'blob': entries.add((sha, name.decode('utf-8')))
    for sha, path in sorted(entries):
        if sha not in blobs: blobs[sha] = git('cat-file', 'blob', sha)
        data = blobs[sha]
        sizes.append((len(data), path))
        findings.extend(inspect(path, data))
    # Include staged changes and newly generated files about to be staged.
    paths = git('ls-files', '-z', '--cached', '--others', '--exclude-standard').decode().split('\0')
    for name in filter(None, paths):
        path = APP / name
        if not path.is_file(): continue
        data=path.read_bytes(); sizes.append((len(data),name))
        findings.extend(inspect(name, data))
    huge=[{'path':p,'bytes':n} for n,p in sizes if n>2_000_000]
    if huge: findings.extend({'path':x['path'],'category':'unexpected file >2MB'} for x in huge)
    findings = [dict(path=p, category=c) for p,c in sorted({(f['path'], f['category']) for f in findings})]
    report={'historyCommitsScanned':len(commits), 'historyBlobsScanned':len(blobs), 'historyAndWorkingFilesScanned':len(set(p for _,p in sizes)), 'findings':findings, 'largestFiles':[{'path':p,'bytes':n} for n,p in sorted(set(sizes),reverse=True)[:8]], 'boundary':'Common secret patterns, private paths, SQLite content and Study-export shapes; manual provenance review is also required.'}
    print(json.dumps(report,indent=2))
    if findings: sys.exit(1)

if __name__=='__main__': main()
