// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blankMem, mkEntry, type Mem } from '../src/lib/memory';

const committed = vi.hoisted(() => vi.fn());
vi.mock('../src/store', async () => {
  const { create } = await import('zustand');
  const { blankMem } = await import('../src/lib/memory');
  const useStore = create<{
    role: 'admin' | null;
    storageOk: boolean;
    mem: Mem;
    commit(fn?: (mem: Mem) => void): void;
  }>()(() => ({
    role: 'admin',
    storageOk: true,
    mem: blankMem(),
    commit(fn) {
      committed();
      const next = structuredClone(useStore.getState().mem);
      fn?.(next);
      useStore.setState({ mem: next });
    },
  }));
  return { useStore };
});

import ProjectSnapshotWatcher from '../src/components/ProjectSnapshotWatcher';
import { useStore } from '../src/store';

function snapshot(note = 'Verified project notes.', seen = 1000): string {
  const mem = blankMem();
  mem.entries.push(
    mkEntry(
      mem,
      {
        key: 'source:alpha:readme',
        title: 'Alpha notes',
        type: 'concept',
        project: 'Alpha',
        note,
        manual: true,
        sources: [{ kind: 'tool', label: 'Read-only project sync', ref: 'file:///Projects/Alpha/README.md' }],
      },
      seen,
    ),
  );
  return JSON.stringify(mem);
}

function file(text: string, lastModified = 1000) {
  return { name: 'brain-project-snapshot.json', size: text.length, lastModified, text: async () => text };
}

function installPicker(getFile: ReturnType<typeof vi.fn>) {
  const picker = vi.fn().mockResolvedValue([{ getFile }]);
  Object.defineProperty(window, 'showOpenFilePicker', { value: picker, configurable: true });
  return picker;
}

async function choose() {
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Watch project notes' })));
}

async function tick() {
  await act(async () => vi.advanceTimersByTimeAsync(30_000));
}

beforeEach(() => {
  vi.useFakeTimers();
  committed.mockClear();
  useStore.setState({ role: 'admin', mem: blankMem(), storageOk: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'showOpenFilePicker');
});

describe('Owner-selected read-only project snapshot watcher', () => {
  it('merges changed file contents through commit, skips exact repeats, and never writes browser storage', async () => {
    let text = snapshot();
    let modified = 1000;
    const getFile = vi.fn(async () => file(text, modified));
    const picker = installPicker(getFile);
    const saved = vi.spyOn(Storage.prototype, 'setItem');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<ProjectSnapshotWatcher />);
    await choose();
    expect(picker).toHaveBeenCalledWith({
      multiple: false,
      excludeAcceptAllOption: true,
      types: [{ description: 'Brain project snapshot', accept: { 'application/json': ['.json'] } }],
    });
    expect(committed).toHaveBeenCalledTimes(1);
    expect(useStore.getState().mem.entries.find(e => e.key === 'source:alpha:readme')?.project).toBe('Alpha');
    modified = 2000;
    await tick();
    expect(committed).toHaveBeenCalledTimes(1);
    text = snapshot('New observed status.', 2000);
    await tick();
    expect(committed).toHaveBeenCalledTimes(2);
    expect(useStore.getState().mem.entries.find(e => e.key === 'source:alpha:readme')?.note).toBe(
      'New observed status.',
    );
    expect(screen.getByRole('status').textContent).toContain('Watching brain-project-snapshot.json');
    expect(saved).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses when no admin is signed in, without opening the picker, polling or committing memory', async () => {
    const picker = installPicker(vi.fn(async () => file(snapshot())));
    useStore.setState({ role: null });
    render(<ProjectSnapshotWatcher />);
    expect(screen.getByRole('button', { name: 'Watch project notes' })).toHaveProperty('disabled', true);
    await choose();
    await tick();
    expect(picker).not.toHaveBeenCalled();
    expect(committed).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps existing memory when JSON is invalid and can recover on a later valid snapshot', async () => {
    const existing = blankMem();
    existing.entries.push(
      mkEntry(existing, { key: 'note:owner', type: 'concept', title: 'Owner note', note: 'Keep me.' }, 1),
    );
    useStore.setState({ mem: existing });
    const before = structuredClone(existing);
    let text = '{broken';
    installPicker(vi.fn(async () => file(text)));
    render(<ProjectSnapshotWatcher />);
    await choose();
    expect(screen.getByRole('alert').textContent).toContain('not valid JSON');
    expect(useStore.getState().mem).toEqual(before);
    expect(committed).not.toHaveBeenCalled();
    text = snapshot();
    await tick();
    expect(committed).toHaveBeenCalledTimes(1);
    expect(useStore.getState().mem.entries.find(e => e.key === 'note:owner')?.note).toBe('Keep me.');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('cancels pending imports and removes polling when the component unmounts', async () => {
    let resolveFile!: (value: ReturnType<typeof file>) => void;
    const pending = new Promise<ReturnType<typeof file>>(resolve => {
      resolveFile = resolve;
    });
    const getFile = vi.fn(() => pending);
    installPicker(getFile);
    const view = render(<ProjectSnapshotWatcher />);
    await choose();
    expect(getFile).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => resolveFile(file(snapshot())));
    await tick();
    expect(committed).not.toHaveBeenCalled();
    expect(getFile).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('discards a pending import and clears file access when the admin locks', async () => {
    let resolveFile!: (value: ReturnType<typeof file>) => void;
    const pending = new Promise<ReturnType<typeof file>>(resolve => {
      resolveFile = resolve;
    });
    const getFile = vi.fn(() => pending);
    installPicker(getFile);
    render(<ProjectSnapshotWatcher />);
    await choose();
    await act(async () => useStore.setState({ role: null }));
    await act(async () => resolveFile(file(snapshot())));
    await tick();
    expect(committed).not.toHaveBeenCalled();
    expect(getFile).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Stop watching' })).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not overlap slow reads and stops reading after the Owner presses Stop', async () => {
    let resolveFile!: (value: ReturnType<typeof file>) => void;
    const pending = new Promise<ReturnType<typeof file>>(resolve => {
      resolveFile = resolve;
    });
    const getFile = vi.fn(() => pending);
    installPicker(getFile);
    render(<ProjectSnapshotWatcher />);
    await choose();
    await tick();
    await tick();
    expect(getFile).toHaveBeenCalledTimes(1);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Stop watching' })));
    await act(async () => resolveFile(file(snapshot())));
    await tick();
    expect(committed).not.toHaveBeenCalled();
    expect(getFile).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toContain('Not watching');
  });

  it('offers Import Files instead of crashing when this browser has no picker', async () => {
    render(<ProjectSnapshotWatcher />);
    await choose();
    expect(screen.getByRole('alert').textContent).toContain('Use Import Files instead');
    expect(committed).not.toHaveBeenCalled();
  });
});
