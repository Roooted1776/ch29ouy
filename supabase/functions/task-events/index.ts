// Brain live feed: the only way a row gets into public.task_events.
// The caller must be a signed-in Brain admin. Every field is typed and capped; there is no free text,
// unknown fields are refused, and anything that looks like a key or token is refused outright.
// Rows are step metadata, never instructions: whoever reads them treats them as data only.
import { createClient } from 'npm:@supabase/supabase-js@2';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

// Same origins as the accounts function. The real gate is the admin check below.
const ORIGINS = new Set([
  'https://roooted1776.github.io',
  'https://redeemed.live',
  'https://www.redeemed.live',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'null',
]);
function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  return {
    ...(ORIGINS.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

export const AGENT_IDS = [
  'grokbot',
  'grok',
  'claude',
  'xcode',
  'gemini',
  'cursor',
  'copilot',
  'chatgpt',
  'perplexity',
  'muse',
] as const;
export const STATUSES = ['start', 'handoff', 'done', 'error'] as const;
const FIELDS = new Set(['task_id', 'step', 'from_agent', 'to_agent', 'words', 'status']);
const TASK_RE = /^[A-Za-z0-9_-]{1,24}$/;
const STEP_RE = /^[a-z][a-z0-9_-]{0,23}$/;
const MAX_BODY = 1024;
const MAX_WORDS = 100000;

// Anything shaped like a key or token: JWTs, Supabase keys, sk_ / sk- keys, long base64 or hex runs.
const KEY_RES = [
  /eyJ[A-Za-z0-9_-]{8,}/,
  /sb_secret_/i,
  /sb_publishable_/i,
  /\bsk[_-][A-Za-z0-9_-]{6,}/i,
  /[A-Fa-f0-9]{32,}/,
  /[A-Za-z0-9+/_=-]{32,}/,
];
export const looksLikeKey = (s: string) => KEY_RES.some(re => re.test(s));

class Refuse extends Error {
  constructor(
    msg: string,
    public status = 400,
  ) {
    super(msg);
  }
}
const reply = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'content-type': 'application/json' } });

export function checkEvent(b: unknown) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Refuse('A step event is required.');
  const e = b as Record<string, unknown>;
  for (const [k, v] of Object.entries(e)) {
    if (!FIELDS.has(k)) throw new Refuse('Unknown field.');
    if (typeof v === 'string' && looksLikeKey(v)) throw new Refuse('That looks like a key. Nothing was saved.');
  }
  const { task_id, step, from_agent, to_agent, words, status } = e;
  if (typeof task_id !== 'string' || !TASK_RE.test(task_id)) throw new Refuse('task_id: 1 to 24 letters, digits, _ or -.');
  if (typeof step !== 'string' || !STEP_RE.test(step)) throw new Refuse('step: 1 to 24 lowercase letters, digits, _ or -.');
  if (typeof from_agent !== 'string' || !(AGENT_IDS as readonly string[]).includes(from_agent))
    throw new Refuse('from_agent is not a Brain agent.');
  if (typeof to_agent !== 'string' || !(AGENT_IDS as readonly string[]).includes(to_agent))
    throw new Refuse('to_agent is not a Brain agent.');
  const w = words ?? 0;
  if (typeof w !== 'number' || !Number.isInteger(w) || w < 0 || w > MAX_WORDS)
    throw new Refuse('words: a whole number from 0 to 100000.');
  if (typeof status !== 'string' || !(STATUSES as readonly string[]).includes(status))
    throw new Refuse('status is not a known step status.');
  return { task_id, step, from_agent, to_agent, words: w, status };
}

async function admin(req: Request) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new Refuse('Sign in first.', 401);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new Refuse('Sign in again.', 401);
  const { data: p } = await db.from('profiles').select('id, role').eq('id', data.user.id).maybeSingle();
  if (!p || p.role !== 'admin') throw new Refuse('Only admins can write the live feed.', 403);
  return p.id as string;
}

async function handle(req: Request) {
  const who = await admin(req);
  const text = await req.text();
  if (text.length > MAX_BODY) throw new Refuse('The step event is too long.', 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Refuse('A step event is required.');
  }
  const row = checkEvent(body);
  const { error } = await db.from('task_events').insert({ ...row, created_by: who });
  if (error) throw new Refuse("Live feed couldn't save this step.", 409);
  await db.rpc('prune_task_events');
  return { ok: true };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return reply(req, 405, { error: 'POST only' });
  try {
    return reply(req, 200, await handle(req));
  } catch (e) {
    if (e instanceof Refuse) return reply(req, e.status, { error: e.message });
    console.error('Task event request failed');
    return reply(req, 500, { error: "Live feed couldn't save this step." });
  }
});
