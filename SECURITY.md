# Security and private data

Public material consists of application source, frozen benchmark prompts, generated
code samples and research provenance. This repository contains no operational Study
database, reviewer responses or raw Play response export. Test and browser-pilot
responses are synthetic fixtures; browser pilots create separate databases under
ignored `qa/` directories.

The hosted Study requires its server-side access code and session cookie. Do not
put that code in source, a `VITE_*` build variable, an issue, a screenshot or a
browser-pilot fixture. `.env.example` contains a placeholder only. Production
configuration belongs in the hosting provider's environment settings.

Play collects opted-in anonymous choices as described in the app and README. Only
aggregate Play counts are public; raw Play rows and Study state require Study
authentication. Anonymous session identifiers are not a guarantee against deliberate
multiple voting. Community preferences are exploratory, not representative research.

Keep SQLite files (including WAL/SHM), reviewer Study/Result files, JSON/CSV research
exports, backups and browser profiles outside version control. Preserve the existing
production volume and database when deploying. Use isolated QA databases for tests;
never send synthetic votes to production. `python scripts/audit_repository.py`
checks tracked files, nonignored working files and reachable Git history for common
secret and private-data patterns. It is a safeguard, not proof that every possible
secret format will be detected.

The public output catalog reveals task/source mappings. Study blinding is intended
for supervised, non-adversarial reviewers; avoid Play and provenance before review.

Report a suspected vulnerability privately using GitHub's **Security → Report a
vulnerability** when available, or the repository owner's GitHub profile contact
route. Do not open a public issue containing credentials, participant exports or
private database contents. Include a minimal reproduction using synthetic data.
