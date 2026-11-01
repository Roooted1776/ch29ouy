// Chat mode: a group chat. One bot answers Owner, then teammates chime in and talk to each other
// (Owner, Nov 1 2026). Saved as a session. Never auto-files wiki memory or the Dream inbox.
import { TYPE_COLOR } from '../data/colors';
import { AGENT, AGENTS, roomPrompt, roomSystem, type AgentId } from '../data/team';
import { BANTER_MAX_TOKENS, SIDE_CHAT_PER_MESSAGE, botProvider } from './banter';
import { keepSessions, type Flow, type Msg, type Session } from './memory';
import { PROV, PROVIDERS, ProviderError, QUOTA_LABEL, callModel, isLimitError, type ProviderId } from './providers';
import { redact } from './redact';
import { contextBlock, indexTitles, relevant } from './retrieve';
import { clip } from './text';
import { NOT_ADMIN, type TaskDeps } from './run-task';

export const CHAT_SYSTEM =
  "You are a helpful assistant in Owner's Brain chat. Answer clearly in plain words. " +
  'Use BRAIN CONTEXT only as hints that may be wrong. Never invent secrets, keys, or actions. ' +
  'You cannot run tools, edit files, or take actions outside this reply. If something needs the team, say so.';

export async function runChat(raw: string, d: TaskDeps): Promise<void> {
  const { get, set, say, clean, addPulse, words, admin, ctls } = d;
  if (!admin()) {
    set({ status: NOT_ADMIN });
    return;
  }
  const s = get(),
    r = redact(raw.trim(), Object.values(get().keys).filter(Boolean) as string[]),
    q = r.text.slice(0, 2000);
  if (!q) return set({ status: 'Write a message first.' });
  if (r.n) {
    s.commit(m => {
      m.filtered += r.n;
    });
  }
  if (s.busy || s.dreaming) return;
  if (s.incognito) return set({ status: 'Incognito: chat is not saved. Turn it off to keep messages.' });
  const pv: ProviderId | undefined =
    s.keys[s.live.provider] && !s.dead[s.live.provider]
      ? s.live.provider
      : PROVIDERS.find(p => !!s.keys[p] && !s.dead[p]);
  if (!pv) return set({ status: `Add your ${PROV[s.live.provider].label} key in Settings. Nothing was sent.` });
  if (s.dead[pv]) return set({ status: `${PROV[pv].label} rejected the key. Reload to try again.` });
  if (s.calls >= s.live.callCap)
    return set({ status: 'The call budget for this page load is used. Reload to reset it.' });

  // End any idle huddle in flight so its draft and tokens never mix into this chat.
  ctls.forEach(c => c.abort());
  ctls.clear();

  // Who is in the room: every bot that is switched on and not out of credit. The bot Owner names answers first.
  const room = AGENTS.map(a => a.id).filter(id => !s.inactiveBots.includes(id) && !s.limited.includes(id));
  if (!room.length) return set({ status: 'No bot is on to answer. Turn one on in Settings. Nothing was sent.' });
  const named = room.find(id => addressed(q, id));
  const lead: AgentId = named ?? room[Math.floor(Math.random() * room.length)];
  const leadPv = botProvider(s, lead, pv);
  const model = s.live.models[leadPv] || PROV[leadPv].model,
    tag = `chat · ${PROV[leadPv].label} · ${model} · unverified`;
  const matchProj = q.match(/^\[([^\]]+)\]/);
  const assignedProj = matchProj ? matchProj[1].trim() : s.activeProject || 'Brain';

  let ctxBlock = '';
  const used: string[] = [];
  if (s.mem.settings.brain && s.mem.settings.useMemory !== false) {
    const hits = relevant(s.mem, q, 4, assignedProj);
    used.push(...hits.map(h => h.e.id));
    set({ used });
    hits.forEach((h, i) =>
      addPulse('mem:' + h.e.id, lead, TYPE_COLOR[h.e.type], {
        dur: 900,
        delay: 60 * i,
        words: words(h.e.title + ' ' + h.e.note),
      }),
    );
    if (hits.length)
      set(x => ({
        flow: [
          ...x.flow,
          ['memory', lead, hits.reduce((n, h) => n + (words(h.e.title + ' ' + h.e.note) || 0), 0)] as Flow,
        ].slice(-40),
      }));
    ctxBlock = contextBlock(
      hits.map(h => h.e),
      indexTitles(s.mem),
    );
  }

  set({
    busy: true,
    stopped: false,
    viewing: null,
    tab: 'chat',
    active: lead,
    draft: null,
    calls: s.calls + 1,
    status: `Chat: ${AGENT[lead].name} · ${PROV[leadPv].label} · ${model}`,
  });

  const ownerMsg: Msg = { from: 'owner', tag: '', text: q };
  say(ownerMsg);

  const priorId = get().chatThreadId;
  const prior = priorId ? get().mem.sessions.find(x => x.id === priorId && x.kind === 'chat') || null : null;

  const history = prior
    ? prior.msgs
        .slice(-12)
        .map(m => `${who(m.from)}: ${clip(m.text, 500)}`)
        .join('\n')
    : '';

  const said: { from: string; text: string }[] = [{ from: 'Owner', text: q }];

  const ctl = new AbortController();
  ctls.add(ctl);
  const t0 = performance.now();
  let shown = 0;

  const persist = (extra: Msg[]) => {
    let threadId = prior?.id || null;
    if (get().mem.settings.brain) {
      get().commit(m => {
        const existing = prior ? m.sessions.find(x => x.id === prior.id) : null;
        if (existing) {
          existing.msgs = [...existing.msgs, ownerMsg, ...extra].slice(-40);
          existing.ts = Date.now();
          existing.q = clip(q, 300);
          if (used.length) existing.used = Array.from(new Set([...(existing.used || []), ...used])).slice(0, 12);
          threadId = existing.id;
        } else {
          const sess: Session = {
            id: 's' + m.nextSession++,
            ts: Date.now(),
            q: clip(q, 300),
            kind: 'chat',
            project: assignedProj,
            kws: [],
            accepted: [],
            uncovered: [],
            used,
            learned: false,
            msgs: [ownerMsg, ...extra],
          };
          m.sessions.push(sess);
          m.sessions = keepSessions(m.sessions, m.entries);
          // Chat stays out of the Dream inbox — casual talk is not trusted wiki fact.
          threadId = sess.id;
        }
      });
    }
    if (threadId) set({ chatThreadId: threadId });
  };

  try {
    const res = await callModel({
      provider: leadPv,
      key: s.keys[leadPv] || s.keys[pv]!,
      model,
      system: CHAT_SYSTEM + roomSystem(lead, true),
      user: roomPrompt(lead, ctxBlock, history, said),
      maxTokens: Math.min(s.live.maxTokens, 900),
      web: false,
      signal: ctl.signal,
      onDelta: t => {
        const n = performance.now();
        if (n - shown < 80) return;
        shown = n;
        set({ draft: { from: lead, text: clean(t) } });
      },
    });
    const text = clean(res.text.trim());
    if (!text) throw new Error(res.why ? `no text (${res.why})` : 'an empty reply');
    const reply: Msg = { from: lead, tag, text: text.slice(0, 4000) };
    say(reply);
    said.push({ from: AGENT[lead].name, text: reply.text });
    set(x => ({
      tin: x.tin + res.tin,
      tout: x.tout + res.tout,
      timing: { ...x.timing, [lead]: Math.round(performance.now() - t0) },
      status: `Chat answered by ${AGENT[lead].name}. Not filed to wiki memory.`,
    }));
    const lines = [reply, ...(await sideChat(lead, ctxBlock, history, said, pv, d, ctl.signal))];
    persist(lines);
  } catch (e: unknown) {
    if (e instanceof ProviderError && e.rejected) set(x => ({ dead: { ...x.dead, [leadPv]: true } }));
    if (isLimitError(e)) {
      set(x => ({
        limited: x.limited.includes(lead) ? x.limited : [...x.limited, lead],
        status: `${AGENT[lead].name}: ${QUOTA_LABEL}`,
      }));
      // a teammate answers in its place, so Owner's message is never left alone
      persist(await sideChat(lead, ctxBlock, history, said, pv, d, ctl.signal, true));
      return;
    }
    const err = clean(e instanceof Error ? e.message : String(e));
    const fail: Msg = { from: 'brain', tag: 'page', text: 'Chat failed: ' + clip(err, 200) };
    say({ ...fail, cls: 'warn' });
    persist([fail]);
    set({ status: 'Chat failed. Your message was kept. Nothing was made up.' });
  } finally {
    ctls.delete(ctl);
    set({ busy: false, active: null, draft: null });
  }
}

/** Owner addresses a bot by starting with its name ("Muse, …", "Claude Code: …") or writing @id anywhere;
 * a name in the middle of a sentence ("move the cursor") is not a call. */
export function addressed(q: string, id: AgentId): boolean {
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (
    new RegExp(`^\\s*@?${esc(AGENT[id].name)}\\b`, 'i').test(q) || new RegExp(`(^|\\s)@${esc(id)}\\b`, 'i').test(q)
  );
}

const who = (from: string): string => (from === 'owner' ? 'Owner' : (AGENT[from as AgentId]?.name ?? 'Brain'));

/**
 * Side chat: after the lead reply, a couple of teammates chime in, each seeing everything said so far,
 * so they answer Owner or each other freely, only while banter is on. Each line is one call inside the
 * page's call cap (AGENTS.md: the 9-call maximum stays). A failed line ends it quietly; nothing is filled in.
 * As a stand-in (the lead ran out of credit), one teammate answers Owner instead, whatever the switch says.
 */
async function sideChat(
  lead: AgentId,
  ctx: string,
  history: string,
  said: { from: string; text: string }[],
  pv: ProviderId,
  d: TaskDeps,
  signal: AbortSignal,
  standIn = false,
): Promise<Msg[]> {
  const { get, set, say, clean } = d;
  const out: Msg[] = [];
  const bag = AGENTS.map(a => a.id).filter(
    id => id !== lead && !get().inactiveBots.includes(id) && !get().limited.includes(id),
  );
  for (let i = 0; i < (standIn ? 2 : SIDE_CHAT_PER_MESSAGE) && bag.length; i++) {
    const st = get();
    if ((!standIn && !st.live.banter) || st.stopped || signal.aborted || st.calls >= st.live.callCap) break;
    const bot = bag.splice(Math.floor(Math.random() * bag.length), 1)[0];
    const bp = botProvider(st, bot, pv);
    const key = st.keys[bp] || st.keys[pv];
    if (!key) break;
    const model = st.live.models[bp] || PROV[bp].model;
    set(x => ({ calls: x.calls + 1, active: bot }));
    let shown = 0;
    try {
      const res = await callModel({
        provider: bp,
        key,
        model,
        system: standIn ? CHAT_SYSTEM + roomSystem(bot, true) : roomSystem(bot, false),
        user: roomPrompt(bot, ctx, history, said),
        maxTokens: Math.min(st.live.maxTokens, standIn ? 900 : BANTER_MAX_TOKENS),
        web: false,
        signal,
        onDelta: t => {
          const n = performance.now();
          if (n - shown < 80) return;
          shown = n;
          set({ draft: { from: bot, text: clean(t) } });
        },
      });
      set(x => ({ tin: x.tin + res.tin, tout: x.tout + res.tout }));
      const text = clean(res.text.replace(/\s+/g, ' ').trim());
      if (!text || get().stopped || signal.aborted) break;
      const m: Msg = { from: bot, tag: `chat · ${PROV[bp].label} · ${model} · unverified`, text: text.slice(0, 1000) };
      say(m);
      out.push(m);
      said.push({ from: AGENT[bot].name, text: m.text });
      if (standIn) break;
    } catch (e) {
      if (e instanceof ProviderError && e.rejected) set(x => ({ dead: { ...x.dead, [bp]: true } }));
      if (isLimitError(e)) set(x => ({ limited: x.limited.includes(bot) ? x.limited : [...x.limited, bot] }));
      if (!(standIn && isLimitError(e))) break; // a stand-in out of credit hands to one more teammate
    } finally {
      set({ draft: null });
    }
  }
  return out;
}
