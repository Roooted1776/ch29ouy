import { describe, expect, it } from 'vitest';
import { taskPath } from '../src/lib/brain-view';
import { importMemoryItems } from '../src/lib/file-import';
import { blankMem, mkEntry } from '../src/lib/memory';
import { archiveCommitNodes } from '../src/lib/project-sync';

describe('the live task path', () => {
  it('runs Owner → agents in order → Brain, each leg lit by the agent it reaches', () => {
    const legs = taskPath(['gemini', 'muse', 'claude', 'grokbot'], {
      gemini: 'done',
      muse: 'working',
      claude: 'skipped',
      grokbot: 'waiting',
    });
    expect(legs).toEqual([
      { from: 'owner', to: 'gemini', state: 'done' },
      { from: 'gemini', to: 'muse', state: 'working' },
      { from: 'muse', to: 'grokbot', state: 'waiting' },
      { from: 'grokbot', to: 'brain', state: 'waiting' },
    ]);
    expect(taskPath(['gemini', 'grokbot'], { gemini: 'done', grokbot: 'done' }).at(-1)?.state).toBe('done');
    expect(taskPath(['gemini'], {})).toEqual([]);
  });
});

describe('commits are not saved one by one', () => {
  it('archives old single-commit memories and keeps everything else', () => {
    const m = blankMem();
    const gh = [{ kind: 'github' as const, label: 'GitHub: Brain@abc1234', ref: null }];
    m.entries.push(
      mkEntry(
        m,
        { key: 'import:a', type: 'workstream', title: 'Brain Commit abc1234: fix', note: 'x', sources: gh },
        1,
      ),
      mkEntry(m, { key: 'import:b', type: 'concept', title: 'Repo: Brain', note: 'y', sources: gh }, 1),
    );
    m.entries[1].links = [m.entries[0].id];
    expect(archiveCommitNodes(m)).toBe(1);
    expect(m.entries.map(e => e.title)).toEqual(['Repo: Brain']);
    expect(m.entries[0].links).toEqual([]);
    expect(m.archived.map(e => e.title)).toEqual(['Brain Commit abc1234: fix']);
  });
  it('a replace digest is rewritten on each sync, not appended', () => {
    const m = blankMem();
    const item = { title: 'Brain: recent commits', type: 'workstream' as const, project: 'Brain', replace: true };
    importMemoryItems(m, [{ ...item, note: 'abc1234 first' }], 'Brain', 1);
    importMemoryItems(m, [{ ...item, note: 'def5678 second' }], 'Brain', 2);
    const digests = m.entries.filter(e => e.title.startsWith('Brain: recent commits'));
    expect(digests.length).toBe(1);
    expect(digests[0].note).toBe('def5678 second');
    expect(digests[0].links).toContain(m.entries.find(e => e.key === 'project:brain')!.id);
  });
});
