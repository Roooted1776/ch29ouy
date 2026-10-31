#!/usr/bin/env python3
"""One-way project snapshot: read approved notes; write only Brain's private output.

No network, credentials, provider calls, source edits, builds, git fetch or commits.
The generated JSON can be imported using Brain's existing admin Import Files UI.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
from datetime import datetime, timezone

BRAIN = Path(__file__).resolve().parents[1]
SKIP = {'.git', 'node_modules', '.venv', 'venv', 'build', 'dist', 'DerivedData',
        '.derivedData', 'Cloud-Backups', 'mri', 'archive', 'legacy', 'memory',
        'skills', 'claude-memory-2026-10-23', 'hub-original', 'AI-Handoff'}
NOTES = {'README.md', 'README.txt', 'STATUS.md', 'HANDOFF.md', 'QUICK-START.md',
         'brain-memory-summary.md'}
SENSITIVE = re.compile(
    r'PRIVATE KEY|\b(?:sk|pk|rk)[-_](?:live|test|ant)[-_]|\b(?:gh[pousr]_|github_pat_|xai-|AIza|gsk_|csk-)'
    r'|\beyJ\S+\.\S+\.\S+|#d=[A-Za-z0-9_-]{16,}'
    r'|(?:password|passcode|secret|token|api[_ -]?key)\s*[:=]', re.I)


def git(path, *args):
    env = {**os.environ, 'GIT_OPTIONAL_LOCKS': '0'}
    p = subprocess.run(['git', '-c', 'core.fsmonitor=false', '-C', str(path), *args],
                       capture_output=True, text=True, timeout=10, env=env)
    return p.stdout.strip() if p.returncode == 0 else ''


def projects(roots):
    """Inventory top-level projects plus nested repos, without following symlinks."""
    found = {}
    for root in roots:
        root = root.resolve()
        if not root.is_dir():
            continue
        for base, dirs, files in os.walk(root, followlinks=False):
            p = Path(base)
            depth = len(p.relative_to(root).parts)
            repo = '.git' in dirs or '.git' in files
            if depth == 1 or repo or (root.name == 'Codex' and depth == 2):
                found[str(p)] = p
            dirs[:] = [d for d in dirs if not d.startswith('.') and d not in SKIP
                       and not (p / d).is_symlink() and depth < 3 and not repo]
    # A container such as Brain/ holds its nested repo rather than being a second project.
    paths = list(found.values())
    return [p for p in paths if not any(p != q and p in q.parents for q in paths)]


def chunks(text, size=550):
    while text:
        end = min(size, len(text))
        if end < len(text):
            boundary = text.rfind(' ', 0, end)
            if boundary > size // 2:
                end = boundary
        yield text[:end].strip()
        text = text[end:].lstrip()


def safe_note(path):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 128 * 1024:
        return ''
    text = path.read_text(encoding='utf-8', errors='replace')
    lines, fenced = [], False
    for line in text.splitlines():
        if line.lstrip().startswith('```'):
            fenced = not fenced
            continue
        if not fenced and not SENSITIVE.search(line):
            lines.append(line.strip())
    return '\n'.join(lines).strip()


def entry(item, index, now):
    identity = json.dumps([item['project'], item['title'], [s.get('ref') for s in item['sources']]], sort_keys=True)
    return {'id': f'e{index}', 'key': 'source:' + hashlib.sha256(identity.encode()).hexdigest(),
            'type': item['type'], 'title': item['title'], 'note': item['note'],
            'project': item['project'], 'sources': item['sources'], 'links': [],
            'strength': 2, 'status': 'fresh', 'created': now, 'seen': item.get('seen', now),
            'corrected': False, 'skill': False, 'prog': None, 'manual': True,
            'corpusId': None, 'kws': None}


def snapshot(roots):
    items, inventory = [], []
    for path in sorted(projects(roots)):
        name = 'Brain' if path == BRAIN else ('Brain archive' if path.name == 'Brain' else path.name)
        branch = git(path, 'symbolic-ref', '--short', 'HEAD')
        head = git(path, 'rev-parse', '--short', 'HEAD')
        changes = git(path, 'status', '--porcelain=v1') if head else ''
        note = f'Read-only source: {path}. '
        note += f'Branch {branch or "detached"}; commit {head}; {len(changes.splitlines())} changed paths.' if head else 'Local project folder; no Git history detected.'
        note += ' Brain observes this project; it never edits, builds, commits, pushes or deploys it.'
        src = {'kind': 'tool', 'label': 'Read-only project sync', 'ref': path.as_uri()}
        items.append({'title': f'{name}: project status'[:80], 'type': 'workstream',
                      'project': name, 'note': note[:600], 'sources': [src]})
        docs = [path / n for n in NOTES if (path / n).is_file()]
        # The current curated release handoff is the only additional RedMed source.
        if name == 'RedMed':
            docs += [path / 'docs/release/HANDOFF.md', path / 'docs/release/archive/HANDOFF-folder-cleanup-2026-10-31.md']
        docs += sorted(path.glob('HANDOFF-*.md'))[:6]
        seen = set()
        for doc in sorted(docs):
            if doc in seen or path not in doc.resolve().parents:
                continue
            seen.add(doc)
            text = safe_note(doc)
            for index, part in enumerate(chunks(text), 1):
                # Path-derived short id prevents equal filenames in distinct folders colliding.
                short = hashlib.sha256(str(doc.relative_to(path)).encode()).hexdigest()[:8]
                title = f'{name}: {doc.name[:32]} {short} ({index})'[:80]
                items.append({'title': title, 'type': 'concept', 'project': name, 'note': part,
                              'seen': int(doc.stat().st_mtime * 1000),
                              'sources': [{'kind': 'tool', 'label': 'Read-only project sync', 'ref': doc.as_uri()}]})
        inventory.append({'name': name, 'path': str(path), 'head': head or None,
                          'documents': len(seen), 'access': 'read-only'})
    # This is the explicit existing Brain memory export, not arbitrary project JSON
    # (which may contain medical/account records and is never scanned).
    imported = BRAIN / 'brain-import.json'
    if any(p['path'] == str(BRAIN) for p in inventory) and imported.is_file() and not imported.is_symlink():
        raw = json.loads(imported.read_text())
        for record in raw.get('memories', []):
            if not isinstance(record, dict):
                continue
            title, note = str(record.get('title', '')).strip(), str(record.get('note', '')).strip()
            if not title or not note or SENSITIVE.search(note):
                continue
            for index, part in enumerate(chunks(note), 1):
                items.append({'title': (title[:60] + f' ({index})')[:80],
                              'type': record.get('type') if record.get('type') in ('concept', 'entity', 'workstream') else 'concept',
                              'project': str(record.get('project') or 'Brain')[:80], 'note': part,
                              'seen': int(imported.stat().st_mtime * 1000),
                              'sources': [{'kind': 'tool', 'label': 'Read-only project sync', 'ref': imported.as_uri()}]})
    now = int(datetime.now(timezone.utc).timestamp() * 1000)
    return {'version': 2, 'generatedAt': datetime.now(timezone.utc).isoformat(),
            'readOnlySources': True, 'projects': inventory, 'memories': items,
            'entries': [entry(item, i, now) for i, item in enumerate(items, 1)]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', action='append', type=Path)
    parser.add_argument('--output', type=Path, default=BRAIN / '.local/project-snapshot.json')
    args = parser.parse_args()
    roots = args.root or [Path.home() / 'Projects', Path.home() / 'Documents/Codex', Path.home() / 'AI-Handoff']
    output = args.output.resolve()
    if BRAIN / '.local' not in output.parents:
        parser.error('Output must stay inside Brain/.local; source projects are read-only.')
    result = snapshot(roots)
    output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if output.is_file():
        previous = json.loads(output.read_text())
        if previous.get('memories') == result['memories'] and previous.get('projects') == result['projects'] and previous.get('entries'):
            print('Project snapshot unchanged. Source folders were read-only.')
            return
    output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
    output.chmod(0o600)
    print(f'{len(result["projects"])} projects; {len(result["memories"])} source records. Saved privately to {output}.')


if __name__ == '__main__':
    main()
