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
BLOCKED = re.compile(r'(^|/)(\.env(?:\..*)?|\.npmrc|node_modules|dist|qa|\.runtime|\.idea|\.vscode|participant-results|exports|responses|results|checkpoints|adapters)(/|$)|\.(?:safetensors|pt|pth|ckpt|pem|p12|pfx)$')

def main():
    findings, sizes, seen = [], [], set()
    # Include every reachable history blob, not just the current .gitignore rules.
    for line in git('rev-list', '--objects', '--all').decode().splitlines():
        parts = line.split(' ', 1)
        if len(parts) != 2:
            continue
        sha, path = parts
        if git('cat-file', '-t', sha).strip() != b'blob':
            continue
        data = git('cat-file', 'blob', sha)
        sizes.append((len(data), path))
        if BLOCKED.search(path): findings.append({'path':path,'category':'excluded artifact in history'})
        for category, pattern in SECRET_PATTERNS:
            if re.search(pattern, data): findings.append({'path':path,'category':category})
        seen.add(path)
    # Include staged changes and newly generated files about to be staged.
    paths = git('ls-files', '-z', '--cached', '--others', '--exclude-standard').decode().split('\0')
    for name in filter(None, paths):
        path = APP / name
        if not path.is_file(): continue
        data=path.read_bytes(); sizes.append((len(data),name))
        if BLOCKED.search(name): findings.append({'path':name,'category':'excluded artifact currently versioned'})
        for category, pattern in SECRET_PATTERNS:
            if re.search(pattern,data):findings.append({'path':name,'category':category})
    huge=[{'path':p,'bytes':n} for n,p in sizes if n>2_000_000]
    if huge: findings.extend({'path':x['path'],'category':'unexpected file >2MB'} for x in huge)
    report={'historyAndWorkingFilesScanned':len(set(p for _,p in sizes)), 'findings':findings, 'largestFiles':[{'path':p,'bytes':n} for n,p in sorted(set(sizes),reverse=True)[:8]], 'boundary':'Pattern and filename audit; selected provenance contains only model-generated outputs, no participants. Task-local GitHub credentials stay in ignored qa and memory.'}
    print(json.dumps(report,indent=2))
    if findings: sys.exit(1)

if __name__=='__main__': main()
