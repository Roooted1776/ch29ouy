// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryPage } from '../src/components/MemoryList';
import { blankMem, type Entry } from '../src/lib/memory';
import { useStore } from '../src/store';

afterEach(cleanup);

const entry = (id: string, title: string, note: string, extra: Partial<Entry> = {}): Entry => ({
  id,
  key: id,
  type: 'workstream',
  title,
  note,
  sources: [],
  strength: 3,
  status: 'fresh',
  created: 1,
  seen: 2,
  links: [],
  corrected: false,
  skill: false,
  prog: null,
  corpusId: null,
  kws: null,
  manual: false,
  ...extra,
});

describe('memory page (Perplexity Brain style)', () => {
  it('opens a selected memory as a page: wiki links, the task behind it and the route it took', async () => {
    const mem = blankMem();
    mem.entries.push(
      entry('e1', 'Launch checklist', 'Steps to launch [[Brain]] safely.', {
        sources: [{ kind: 'session', label: 'Session s1', ref: 's1' }],
      }),
      entry('e2', 'Brain', 'The page itself.'),
    );
    mem.sessions.push({
      id: 's1',
      ts: 3,
      q: 'Plan the Brain launch',
      kws: [],
      accepted: [],
      uncovered: [],
      msgs: [{ from: 'gemini', tag: 'live', text: 'hi Muse' }],
      flow: [
        ['gemini', 'muse', 40],
        ['muse', 'grokbot', 30],
      ],
    });
    useStore.setState({ mem, selected: 'e1', role: 'admin', viewing: null });
    render(<MemoryPage />);
    const page = screen.getByRole('complementary', { name: 'Memory page' });
    expect(page.textContent).toContain('Launch checklist');
    expect(page.textContent).toContain('Tasks (1)');
    expect(page.textContent).toMatch(/Gemini.*Muse.*Grok Bot/);
    // [[Brain]] is a link to that page, not plain text
    await userEvent.click(screen.getByRole('button', { name: 'Brain' }));
    expect(useStore.getState().selected).toBe('e2');
  });

  it('a task card opens that exact task in the chat', async () => {
    const mem = blankMem();
    mem.entries.push(
      entry('e1', 'Launch checklist', 'Steps.', { sources: [{ kind: 'session', label: 'S', ref: 's1' }] }),
    );
    mem.sessions.push({ id: 's1', ts: 3, q: 'Plan the Brain launch', kws: [], accepted: [], uncovered: [], msgs: [] });
    useStore.setState({ mem, selected: 'e1', role: 'admin', viewing: null });
    render(<MemoryPage />);
    await userEvent.click(screen.getByRole('button', { name: /Plan the Brain launch/ }));
    expect(useStore.getState().viewing?.id).toBe('s1');
    expect(useStore.getState().tab).toBe('chat');
  });
});
