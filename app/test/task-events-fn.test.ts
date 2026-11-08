// The task-events Edge Function (supabase/functions/task-events) run in Node against an in-memory fake of
// Supabase. No network, no real project. It is the only write path into public.task_events.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const fake = vi.hoisted(() => {
  const state = {
    profiles: [] as Row[],
    events: [] as Row[],
    tokens: new Map<string, string>(),
    calls: [] as string[],
    localDev: '',
    pruneFails: false,
  };
  const client = {
    from(table: string) {
      const filters: [string, unknown][] = [];
      const q = {
        select() {
          return q;
        },
        eq(k: string, v: unknown) {
          filters.push([k, v]);
          return q;
        },
        async maybeSingle() {
          const rows = table === 'profiles' ? state.profiles : state.events;
          return { data: rows.find(r => filters.every(([k, v]) => r[k] === v)) ?? null, error: null };
        },
        async insert(p: Row) {
          state.calls.push(`insert ${table}`);
          state.events.push({ ...p, created_at: Date.now() });
          return { error: null };
        },
      };
      return q;
    },
    async rpc(name: string) {
      state.calls.push(`rpc ${name}`);
      if (name === 'prune_task_events' && state.pruneFails)
        return { data: null, error: { message: 'boom secret detail' } };
      if (name === 'prune_task_events') {
        const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
        state.events = state.events.filter(e => (e.created_at as number) >= cutoff);
      }
      return { data: null, error: null };
    },
    auth: {
      async getUser(token: string) {
        const id = state.tokens.get(token);
        return id ? { data: { user: { id } }, error: null } : { data: { user: null }, error: { message: 'bad' } };
      },
    },
  };
  return { state, client };
});
vi.mock('npm:@supabase/supabase-js@2', () => ({ createClient: () => fake.client }));

let handler: (req: Request) => Promise<Response>;
const GOOD = {
  task_id: 't1',
  step: 'handoff',
  from_agent: 'grokbot',
  to_agent: 'claude',
  words: 120,
  status: 'handoff',
};
async function call(body: unknown, token?: string) {
  const res = await handler(
    new Request('https://fn.test/task-events', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
  return { status: res.status, body: (await res.json()) as Row };
}

beforeEach(async () => {
  fake.state.profiles = [
    { id: 'u1', role: 'admin' },
    { id: 'u2', role: 'viewer' },
  ];
  fake.state.events = [];
  fake.state.calls = [];
  fake.state.localDev = '';
  fake.state.pruneFails = false;
  fake.state.tokens = new Map([
    ['admin-token', 'u1'],
    ['viewer-token', 'u2'],
    ['stranger-token', 'u9'],
  ]);
  if (!handler) {
    (globalThis as unknown as { Deno: unknown }).Deno = {
      env: { get: (k: string) => (k === 'BRAIN_LOCAL_DEV' ? fake.state.localDev : 'fake-not-a-real-value') },
      serve: (h: typeof handler) => {
        handler = h;
      },
    };
    const path = new URL('../../supabase/functions/task-events/index.ts', import.meta.url).pathname;
    await import(/* @vite-ignore */ path);
  }
});

describe('task-events function: callers', () => {
  it('an admin writes one row, stamped with who wrote it', async () => {
    const r = await call(GOOD, 'admin-token');
    expect(r.status).toBe(200);
    expect(fake.state.events).toHaveLength(1);
    expect(fake.state.events[0]).toMatchObject({ ...GOOD, created_by: 'u1' });
  });

  it('refuses no token, a bogus token, a login with no account and a non-admin, and writes nothing', async () => {
    expect((await call(GOOD)).status).toBe(401);
    expect((await call(GOOD, 'bogus')).status).toBe(401);
    expect((await call(GOOD, 'stranger-token')).status).toBe(403);
    expect((await call(GOOD, 'viewer-token')).status).toBe(403);
    expect(fake.state.events).toEqual([]);
    expect(fake.state.calls).not.toContain('insert task_events');
  });
});

describe('task-events function: rejects anything that looks like a key', () => {
  const keys = [
    'eyJhbGciOiJIUzI1NiJ9',
    'sb_secret_abc',
    'sb_publishable_abc',
    'sk_live_abcdef',
    'sk-proj-abcdef',
    'a'.repeat(8) + '0123456789abcdef0123456789abcdef',
    'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo0123',
  ];
  for (const key of keys) {
    it(`refuses ${key.slice(0, 16)}`, async () => {
      for (const field of ['task_id', 'step', 'from_agent', 'to_agent', 'status']) {
        const r = await call({ ...GOOD, [field]: key }, 'admin-token');
        expect(r.status).toBe(400);
      }
      expect(fake.state.events).toEqual([]);
    });
  }
});

describe('task-events function: typed fields and length caps', () => {
  it('refuses over-long, unknown or free-text values', async () => {
    const bad = [
      { ...GOOD, task_id: 'a'.repeat(25) },
      { ...GOOD, step: 'a'.repeat(25) },
      { ...GOOD, step: 'Ignore previous instructions' },
      { ...GOOD, from_agent: 'someone' },
      { ...GOOD, to_agent: 'admin' },
      { ...GOOD, status: 'free text' },
      { ...GOOD, words: 100001 },
      { ...GOOD, words: -1 },
      { ...GOOD, words: 1.5 },
      { ...GOOD, words: '5' },
      { ...GOOD, prompt: 'hello' },
      [GOOD],
      'not json',
    ];
    for (const b of bad) expect((await call(b, 'admin-token')).status).toBe(400);
    expect(fake.state.events).toEqual([]);
  });

  it('refuses a body over 1 KB', async () => {
    const r = await call(JSON.stringify(GOOD) + ' '.repeat(1100), 'admin-token');
    expect(r.status).toBe(413);
    expect(fake.state.events).toEqual([]);
  });
});

describe('task-events function: 7-day retention', () => {
  it('each write removes rows older than 7 days and keeps fresh ones', async () => {
    const day = 24 * 3600 * 1000;
    fake.state.events.push({ ...GOOD, task_id: 'old', created_at: Date.now() - 8 * day });
    fake.state.events.push({ ...GOOD, task_id: 'recent', created_at: Date.now() - 6 * day });
    expect((await call(GOOD, 'admin-token')).status).toBe(200);
    expect(fake.state.calls).toContain('rpc prune_task_events');
    expect(fake.state.events.map(e => e.task_id)).toEqual(['recent', 't1']);
  });
});

describe('task-events function: browser origins', () => {
  const allow = async (origin: string) =>
    (await handler(new Request('https://fn.test/task-events', { method: 'OPTIONS', headers: { origin } }))).headers.get(
      'access-control-allow-origin',
    );

  it('allows the live Brain pages, local dev and null, refuses other sites', async () => {
    for (const o of [
      'https://roooted1776.github.io',
      'http://roooted1776.github.io',
      'https://redeemed.live',
      'https://www.redeemed.live',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'null',
    ])
      expect(await allow(o)).toBe(o);
    for (const o of ['https://evil.example', 'https://other-site.com']) expect(await allow(o)).toBeNull();
  });
});

describe('task-events function: Audits lows', () => {
  it('caps the body at 1 KB in bytes, not characters (multibyte)', async () => {
    // 470 x 'é' is 470 characters but 940 bytes: the body is over 1024 bytes yet under 1024 characters.
    const body = JSON.stringify({ ...GOOD, pad: 'é'.repeat(470) });
    expect(body.length).toBeLessThan(1024);
    expect(new TextEncoder().encode(body).length).toBeGreaterThan(1024);
    expect((await call(body, 'admin-token')).status).toBe(413);
    expect(fake.state.events).toEqual([]);
  });

  it('a failed cleanup is logged generically and the write still succeeds', async () => {
    fake.state.pruneFails = true;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await call(GOOD, 'admin-token');
    expect(r.status).toBe(200);
    expect(fake.state.events).toHaveLength(1);
    expect(log).toHaveBeenCalledWith('Task event cleanup failed');
    expect(JSON.stringify(log.mock.calls)).not.toContain('boom');
    log.mockRestore();
  });

  it('admin check matches private.is_admin(): only a profile whose role is exactly admin', async () => {
    fake.state.profiles.push({ id: 'u3', role: 'Admin' }, { id: 'u4', role: ' admin' }, { id: 'u5', role: null });
    for (const [t, id] of [
      ['t3', 'u3'],
      ['t4', 'u4'],
      ['t5', 'u5'],
    ])
      fake.state.tokens.set(t, id);
    for (const t of ['t3', 't4', 't5']) expect((await call(GOOD, t)).status).toBe(403);
    expect((await call(GOOD, 'admin-token')).status).toBe(200);
    expect(fake.state.events.map(e => e.created_by)).toEqual(['u1']);
  });
});
