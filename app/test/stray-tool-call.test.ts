import { describe, expect, it } from 'vitest';
import { callModel, isToolCallError } from '../src/lib/providers';

const bad = () =>
  new Response(
    JSON.stringify({
      error: { message: "Tool call validation failed: attempted to call tool 'JSON' which was not in request.tools" },
    }),
    { status: 400 },
  );
const good = () =>
  new Response(JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }), { status: 200 });

describe('stray tool call', () => {
  it('spots the error', () => {
    expect(isToolCallError(new Error("attempted to call tool 'JSON' which was not in request.tools"))).toBe(true);
    expect(isToolCallError(new Error('HTTP 429'))).toBe(false);
  });
  it('retries once', async () => {
    let n = 0;
    const r = await callModel({
      provider: 'groq',
      key: 'k',
      model: 'm',
      system: 's',
      user: 'u',
      maxTokens: 10,
      fetchImpl: (async () => (++n === 1 ? bad() : good())) as typeof fetch,
    });
    expect(r.text).toBe('ok');
    expect(n).toBe(2);
  });
});
