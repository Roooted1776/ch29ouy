#!/usr/bin/env python3
"""Prepare Brain-only source upserts; --sync uses an already signed-in Supabase CLI.

No credentials are accepted or saved by this script. Source projects stay read-only.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import time

BRAIN = Path(__file__).resolve().parents[1]
PROJECT_REF = 'iihjcqiiavleyheqzotl'
TOOLS = {
    'ChatGPT': 'OpenAI assistant for reasoning and review.',
    'Claude Code': 'Anthropic coding tool; builder and careful reasoning.',
    'Cursor': 'Code integration and repository review.',
    'Gemini': 'Context, documents and multimodal cross-checks.',
    'Copilot': 'Coding assistance.',
    'Grok': 'Strategy, logic and challenge review.',
    'Muse': 'Independent audit and error finding.',
    'Perplexity': 'Search and logic only.',
    'Xcode': 'iOS app work, builds and device testing.',
}


def source_rows(manifest):
    now = int(time.time() * 1000)
    items = list(manifest['memories'])
    rule = Path.home() / 'AI-Handoff/standing-handoff-rule.md'
    for name, role in TOOLS.items():
        items.append({'title': 'Active tool: ' + name, 'type': 'entity', 'project': 'Brain',
                      'note': role + ' Owner confirmed this tool on 2026-10-31. A roster entry is not proof of a live connection to the installed app. Read the incoming project handoff before acting; leave verified results and a short handoff afterward. Source projects stay read-only to Brain.',
                      'sources': [{'kind': 'tool', 'label': 'Read-only project sync', 'ref': rule.as_uri()}]})
    # Metadata from the connected project inventory; never ingest private chat text.
    items.append({'title': 'Life: project status', 'type': 'workstream', 'project': 'Life',
                  'note': 'A ChatGPT project named Life was found in the connected Codex project list. No local project files or chat contents were ingested. Source access remains read-only; private chat memory is not automatically shared with Brain.',
                  'sources': [{'kind': 'tool', 'label': 'Read-only project sync', 'ref': None}]})
    rows = []
    for item in items:
        if not 0 < len(item['note']) <= 600:
            raise ValueError('A source note exceeds the storage contract.')
        identity = json.dumps([item['project'], item['title'], [s.get('ref') for s in item['sources']]], sort_keys=True)
        signature = json.dumps({k: item[k] for k in ('project', 'title', 'type', 'note', 'sources')}, sort_keys=True)
        body = {'links': [], 'strength': 2, 'status': 'fresh', 'created': now,
                'seen': item.get('seen', now), 'corrected': False, 'skill': False,
                'prog': None, 'manual': True, 'kws': None, 'sources': item['sources'],
                'sourceHash': hashlib.sha256(signature.encode()).hexdigest()}
        rows.append({'key': 'source:' + hashlib.sha256(identity.encode()).hexdigest(),
                     'type': item['type'], 'title': item['title'], 'note': item['note'],
                     'project': item['project'], 'body': body})
    return rows


def sql_batch(rows):
    payload = json.dumps(rows, ensure_ascii=False).replace("'", "''")
    return """begin;
with incoming as (select * from jsonb_to_recordset('""" + payload + """'::jsonb) as x(key text,type text,title text,note text,project text,body jsonb)),
seed as (select coalesce(max(substring(id from 2)::bigint),0) as n from public.memories)
insert into public.memories(id,key,type,title,note,project,body,archived)
select 'e'||(seed.n+row_number() over(order by key))::text,key,type,title,note,project,body,false from incoming cross join seed
on conflict(key) do update set title=excluded.title,note=excluded.note,project=excluded.project,body=excluded.body,updated_at=now()
where public.memories.body->>'sourceHash' is distinct from excluded.body->>'sourceHash';
update public.memories set archived=true,updated_at=now()
where not archived and (title ~* '^Undefined term([[:space:]]|$)' or (type='entity' and lower(title) in ('freebuff','archil','comet')));
insert into public.projects(id,name) select distinct project,project from public.memories where not archived and project is not null on conflict(id) do nothing;
commit;
select jsonb_build_object('projects',(select count(*) from public.projects),'source_records',(select count(*) from public.memories where not archived and key like 'source:%')) as result;
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sync', action='store_true', help='Persist only to the Brain project using existing CLI sign-in.')
    args = parser.parse_args()
    rows = source_rows(json.loads((BRAIN / '.local/project-snapshot.json').read_text()))
    private = BRAIN / '.local'
    for number, offset in enumerate(range(0, len(rows), 20)):
        path = private / f'project-sync-batch-{number}.sql'
        path.write_text(sql_batch(rows[offset:offset + 20]))
        path.chmod(0o600)
        if args.sync:
            result = subprocess.run(['supabase', 'db', 'query', '--linked', '--project-ref', PROJECT_REF,
                                     '--file', str(path), '--output', 'json'], capture_output=True, text=True)
            if result.returncode:
                raise SystemExit('Brain persistence failed. Existing Supabase CLI sign-in is required; no credentials were saved and no source project was changed.')
    print(f'Prepared {len(rows)} source records in {(len(rows) + 19) // 20} private batches for Brain only.' + (' Database sync completed.' if args.sync else ''))


if __name__ == '__main__':
    main()
