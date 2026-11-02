// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import StreamSteps from '../src/components/StreamSteps';
import { blankMem, mkEntry } from '../src/lib/memory';
import { useStore } from '../src/store';

const start = useStore.getState();
afterEach(() => {
  cleanup();
  useStore.setState(start, true);
});

describe('Perplexity-style steps and sources', () => {
  it('shows nothing before a task', () => {
    const { container } = render(<StreamSteps />);
    expect(container.textContent).toBe('');
  });
  it('lists numbered memory sources and each agent step with its state', () => {
    const mem = blankMem();
    const e = mkEntry(mem, { key: 'ai:concept:vault', type: 'concept', title: 'Vault', note: 'Encrypted.' }, 1);
    mem.entries.push(e);
    useStore.setState({
      mem,
      used: [e.id],
      busy: true,
      viewing: null,
      stages: { gemini: 'done', muse: 'working', claude: 'waiting', xcode: 'skipped' },
    });
    render(<StreamSteps />);
    expect(screen.getByText('Sources from Brain')).toBeTruthy();
    expect(screen.getByRole('button', { name: /1 Vault/ })).toBeTruthy();
    expect(screen.getByText(/Steps 1\/3/)).toBeTruthy();
    expect(screen.queryByText('Xcode')).toBeNull();
  });
});
