import { describe, expect, it } from 'vitest';
import { importKey as appImportKey } from '../src/lib/file-import';
import { blankMem, sanitizeMem } from '../src/lib/memory';
import { PROV, PROVIDERS } from '../src/lib/providers';
// The headless agent sync script (scripts/brain-sync.mjs) must write exactly what the app writes.
// @ts-expect-error plain Node script without type declarations
import * as syncModule from '../../scripts/brain-sync.mjs';

const sync: any = syncModule;

const work = {
  agent: 'claude',
  provider: 'Anthropic',
  model: 'claude-code',
  project: 'Nodes',
  taskId: 'brain-sync-build',
  task: 'Build the headless sync loop',
  msgs: [{ from: 'claude', text: 'Built scripts/brain-sync.mjs and skill routing.' }],
  learned: [
    { type: 'concept', title: 'Headless sync rule', note: 'x'.repeat(1300) },
    { type: 'entity', title: 'Grok Bot filing', note: 'Files memory after tasks.', ai: true },
  ],
};

describe('headless agent sync script', () => {
  it('uses the app import: key rule and the ai: key rule', () => {
    for (const [p, t, title] of [
      ['Nodes', 'concept', 'Headless sync rule'],
      ['Brain', 'workstream', 'A Very Long Title '.repeat(6)],
    ] as const)
      expect(sync.importKey(p, t, title)).toBe(appImportKey(p, t, title));
    expect(sync.aiKey('entity', 'Grok Bot Filing')).toBe('ai:entity:grok bot filing');
  });

  it('only uses provider labels the app accepts as live tags', () => {
    expect([...sync.LABELS].sort()).toEqual(PROVIDERS.map(p => PROV[p].label).sort());
  });

  it('splits long notes into 600-character parts like file import', () => {
    const parts = sync.noteParts('import:concept:abc:t', 'T', 'y'.repeat(1300));
    expect(parts.map((p: any) => p.key)).toEqual([
      'import:concept:abc:t',
      'import:concept:abc:t:part:2',
      'import:concept:abc:t:part:3',
    ]);
    expect(parts.map((p: any) => p.note.length)).toEqual([600, 600, 100]);
    expect(parts[1].title).toBe('T (part 2)');
  });

  it('builds rows and a session the app loads back', () => {
    const out = sync.buildPush(work, {
      session: 's10',
      nextEntry: 485,
      existing: { [sync.aiKey('entity', 'Grok Bot filing')]: { id: 'e7', body: { strength: 2, created: 5 } } },
      projectNode: 'e405',
    });
    expect(out.memories.map((m: any) => m.p_id)).toEqual(['e485', 'e486', 'e487', 'e7']);
    const reused = out.memories[3];
    expect(reused.p_body).toMatchObject({ strength: 3, created: 5, manual: false, links: ['e405'], status: 'fresh' });
    for (const m of out.memories) {
      expect(m.p_note.length).toBeLessThanOrEqual(600);
      expect(m.p_project).toBe('Nodes');
      expect(Object.keys(m.p_body).sort()).toEqual(
        [
          'links',
          'strength',
          'status',
          'created',
          'seen',
          'corrected',
          'skill',
          'prog',
          'manual',
          'kws',
          'sources',
        ].sort(),
      );
    }
    expect(out.session.p_id).toBe('s10');
    // the app keeps it on load: it carries a real live tag, the owner and the project node
    const m = sanitizeMem({
      ...blankMem(),
      entries: out.memories.map((r: any) => ({
        ...r.p_body,
        id: r.p_id,
        key: r.p_key,
        type: r.p_type,
        title: r.p_title,
        note: r.p_note,
        project: r.p_project,
      })),
      sessions: [out.session.p_body],
    } as any)!;
    expect(m.sessions.map(s => s.id)).toEqual(['s10']);
    expect(m.sessions[0].owner).toBe('claude');
    expect(m.sessions[0].msgs[1].tag).toBe('live · Anthropic · claude-code · unverified');
  });

  it('refuses anything that looks like a key, and unknown agents or labels', () => {
    expect(() =>
      sync.buildPush({ ...work, task: 'use sk-abcdef1234567890' }, { session: 's1', nextEntry: 1, existing: {} }),
    ).toThrow(/key/);
    expect(() => sync.buildPush({ ...work, agent: 'hal' }, { session: 's1', nextEntry: 1, existing: {} })).toThrow(
      /agent/,
    );
    expect(() => sync.buildPush({ ...work, provider: 'Acme' }, { session: 's1', nextEntry: 1, existing: {} })).toThrow(
      /provider/,
    );
    expect(() => sync.buildPush({ ...work, msgs: [] }, { session: 's1', nextEntry: 1, existing: {} })).toThrow(
      /agent message/,
    );
    // a commit hash is fine
    expect(sync.looksLikeKey('commit e43909470d753c2e0969eb55da91bed925027a42')).toBe(false);
  });

  it('one owner per task, read from task_events', () => {
    const ev = [{ from_agent: 'muse', to_agent: 'claude', status: 'handoff' }];
    expect(sync.canClaim([], 'cursor')).toMatchObject({ ok: true });
    expect(sync.canClaim(ev, 'claude')).toMatchObject({ ok: true, already: false });
    expect(sync.canClaim(ev, 'cursor')).toMatchObject({ ok: false });
    expect(
      sync.canClaim([...ev, { from_agent: 'claude', to_agent: 'claude', status: 'start' }], 'claude'),
    ).toMatchObject({
      ok: true,
      already: true,
    });
    expect(sync.canClaim([...ev, { from_agent: 'claude', to_agent: 'claude', status: 'done' }], 'claude').ok).toBe(
      false,
    );
  });

  it('pull re-joins note parts and ranks by keyword', () => {
    const rows = [
      {
        id: 'e2',
        key: 'import:concept:1:a:part:2',
        type: 'concept',
        title: 'A (part 2)',
        note: ' routing',
        project: 'Nodes',
        body: {},
      },
      { id: 'e1', key: 'import:concept:1:a', type: 'concept', title: 'A', note: 'skill', project: 'Nodes', body: {} },
      { id: 'e3', key: 'import:concept:2:b', type: 'concept', title: 'B', note: 'other', project: 'Nodes', body: {} },
    ];
    const r = sync.rankMemory(rows, ['routing']);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: 'e1', title: 'A', note: 'skill routing' });
    expect(sync.rankMemory(rows, [])).toHaveLength(2);
  });
});
