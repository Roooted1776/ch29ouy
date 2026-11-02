// @vitest-environment jsdom
/** Sign-in and memory-sync cleanup wired through auth-store (fake backend only). */
import { act } from '@testing-library/react';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

const server = vi.hoisted(() => ({
  users: [] as { id: string; name: string; role: 'admin'; password: string; wrap: unknown }[],
  vault: null as unknown,
  rev: 1,
  /** What the next memory-database pull returns (other agents' copy). */
  remoteMem: null as unknown,
}));

vi.mock('../src/lib/cloud', () => ({
  async accounts(action: string, b: Record<string, unknown> = {}) {
    if (action === 'status') return { setupNeeded: !server.users.length };
    if (action === 'list') return { users: server.users.map(u => ({ ...u, created_at: new Date().toISOString() })) };
    if (action === 'setup' || action === 'create') {
      const user = {
        id: String(server.users.length + 1),
        name: b.name as string,
        password: b.password as string,
        role: 'admin' as const,
        wrap: b.wrap,
      };
      server.users.push(user);
      if (b.envelope) server.vault = b.envelope;
      return { ok: true, user };
    }
    throw new Error(`Unknown fake action ${action}`);
  },
  async signIn(name: string, pass: string) {
    const { derivePassword } = await import('../src/lib/auth');
    const { password, kek } = await derivePassword(name, pass);
    const user = server.users.find(u => u.name.toLowerCase() === name.trim().toLowerCase() && u.password === password);
    if (!user) throw new Error('Name or passcode is wrong.');
    return { user: { id: user.id, name: user.name, role: user.role }, kek };
  },
  async signOut() {},
  async accountWrap(uid: string) {
    return server.users.find(u => u.id === uid)!.wrap;
  },
  async loadVault() {
    return { envelope: server.vault, rev: server.rev };
  },
  async saveVault(envelope: unknown, rev: number) {
    if (rev !== server.rev) throw new Error('Conflict');
    server.vault = envelope;
    return ++server.rev;
  },
  async writeAudit() {},
  async syncMemoryDatabase() {
    return { saved: 0, failed: 0, firstError: '' };
  },
  async loadMemoryDatabase() {
    return server.remoteMem ?? { entries: [], sessions: [] };
  },
  resetMirror() {},
  async readAudit() {
    return [];
  },
}));

async function loginWithSeed(seed: Record<string, unknown>) {
  vi.resetModules();
  localStorage.clear();
  sessionStorage.clear();
  const { derivePassword } = await import('../src/lib/auth');
  const { newSecrets, encryptVault, sealFor } = await import('../src/lib/vault');
  const { blankMem } = await import('../src/lib/memory');
  const sec = await newSecrets();
  server.users = [];
  server.remoteMem = null;
  const { password, kek } = await derivePassword('Owner', 'correct horse battery');
  server.users.push({
    id: 'Owner',
    name: 'Owner',
    role: 'admin',
    password,
    wrap: await sealFor(kek, sec),
  });
  server.vault = await encryptVault(sec, { mem: { ...blankMem(), ...seed }, keys: {} }, 1);
  server.rev = 1;
  const auth = await import('../src/auth-store');
  const store = await import('../src/store');
  await act(async () => {
    await auth.useAuth.getState().login('Owner', 'correct horse battery');
  });
  return { auth, store, sec };
}

function toolNode(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    key: 'note:cerebras',
    type: 'entity',
    title: 'Cerebras',
    note: 'Old removed-tool node.',
    sources: [],
    links: [],
    strength: 2,
    seen: 1_700_000_000_000,
    created: 1_700_000_000_000,
    status: 'fresh',
    manual: true,
    corrected: false,
    skill: false,
    prog: null,
    corpusId: null,
    kws: null,
    ...extra,
  };
}

beforeEach(() => {
  server.users = [];
  server.vault = null;
  server.rev = 1;
  server.remoteMem = null;
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('auth-store sign-in cleanup', () => {
  it('archives a retired tool node on admin sign-in and reports it', async () => {
    const { store } = await loginWithSeed({
      entries: [toolNode('e1')],
      nextId: 2,
    });
    const st = store.useStore.getState();
    expect(st.mem.entries.map(e => e.title)).toEqual([]);
    expect(st.mem.archived.map(e => e.title)).toEqual(['Cerebras']);
    expect(st.status).toMatch(/Cleaned up 1 node\(s\) for removed tools/);
  }, 30000);

  it('skips cleanup work when no retired tool title is present', async () => {
    const { store } = await loginWithSeed({
      entries: [toolNode('e1', { key: 'note:dentist', type: 'concept', title: 'Call dentist', note: '' })],
      nextId: 2,
    });
    const st = store.useStore.getState();
    expect(st.mem.entries.map(e => e.title)).toEqual(['Call dentist']);
    expect(st.mem.archived).toEqual([]);
    expect(st.status).not.toMatch(/Cleaned up/);
  }, 30000);
});

describe('auth-store memory sync cleanup', () => {
  it('shows a cleaned-up status when a pull only archives removed-tool nodes', async () => {
    // Fake only timer APIs so the first pull waits until we advance; crypto login stays real.
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] });
    const { store } = await loginWithSeed({
      entries: [toolNode('e2', { key: 'note:kept', type: 'concept', title: 'Keep me', note: 'Ordinary note.' })],
      nextId: 3,
    });
    const { blankMem } = await import('../src/lib/memory');
    server.remoteMem = blankMem();
    act(() => {
      store.useStore.getState().commit(m => {
        m.entries.push(toolNode('e9') as (typeof m.entries)[number]);
      });
    });
    expect(store.useStore.getState().mem.entries.some(e => e.title === 'Cerebras')).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    const st = store.useStore.getState();
    expect(st.status).toBe('Memory sync: cleaned up 1 node(s) for removed tools; they stay in the archive.');
    expect(st.mem.entries.map(e => e.title)).toEqual(['Keep me']);
    expect(st.mem.archived.some(e => e.title === 'Cerebras')).toBe(true);
  }, 30000);
});
