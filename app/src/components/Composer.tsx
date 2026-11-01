import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { guessProvider } from '../lib/keyguide';
import { PROV } from '../lib/providers';

export default function Composer() {
  const [q, setQ] = useState(''),
    busy = useStore(s => s.busy),
    send = useStore(s => s.send),
    stop = useStore(s => s.stop),
    ready = useStore(s => Object.values(s.keys).some(Boolean)),
    promptDraft = useStore(s => s.promptDraft),
    setPromptDraft = useStore(s => s.setPromptDraft),
    isAdmin = useStore(s => s.role === 'admin');

  useEffect(() => {
    if (promptDraft) {
      setQ(promptDraft);
      setPromptDraft('');
    }
  }, [promptDraft, setPromptDraft]);
  const go = () => {
    const t = q.trim();
    // a pasted API key is saved on this device (sealed) and is never sent as a message
    const prov = /^\S{20,300}$/.test(t) ? guessProvider(t) : null;
    if (prov && !busy) {
      const st = useStore.getState();
      st.setKey(t, prov);
      // setKey refuses non-admins and leaves its own message; only claim "saved" if the key was stored
      if (useStore.getState().keys[prov] === t.slice(0, 300)) {
        st.setLive({ remember: true });
        useStore.setState({
          status: `${PROV[prov].label} key saved on this device.`,
        });
      }
      setQ('');
      return;
    }
    if (!t || busy || !ready) return;
    void send(q);
    setQ('');
  };
  return (
    <>
      <form
        className="composer minimal"
        onSubmit={e => {
          e.preventDefault();
          go();
        }}
      >
        <textarea
          value={q}
          onChange={e => setQ(e.target.value)}
          rows={1}
          maxLength={2000}
          disabled={busy}
          placeholder={!ready ? 'Paste an API key here to save it' : 'Message the team… (task: … runs a full task)'}
          aria-label="Message the team"
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              go();
            }
          }}
        />
        {busy ? (
          <button type="button" className="icon-btn stop" onClick={stop} aria-label="Stop" title="Stop">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <rect x="3" y="3" width="10" height="10" fill="currentColor" />
            </svg>
          </button>
        ) : (
          <button
            type="submit"
            className="icon-btn send"
            disabled={!q.trim() || (!ready && !guessProvider(q))}
            aria-label="Send"
            title="Send"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" shapeRendering="crispEdges">
              <path d="M8 2 3 7h3v7h4V7h3z" fill="currentColor" />
            </svg>
          </button>
        )}
      </form>
      {!ready && isAdmin && (
        <p className="hint composer-key-hint">Add an API key to chat. Paste it into this box to save it.</p>
      )}
    </>
  );
}
