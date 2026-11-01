import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { dreamDue } from '../lib/dream';
import { useAuth } from '../auth-store';
import { useStore } from '../store';
import AdminPanel from './AdminPanel';
import AgentInspector from './AgentInspector';
import ChatPanel from './ChatPanel';
import FlowPane from './FlowPane';
import MemoryList, { MemoryPage } from './MemoryList';
import SearchBar from './SearchBar';

const BrainScene = lazy(() => import('./BrainScene'));

class Boundary extends Component<{ children: ReactNode }, { err: string }> {
  state = { err: '' };
  static getDerivedStateFromError(e: Error) {
    return { err: e.message };
  }
  render() {
    return this.state.err ? (
      <div className="fallback">
        <b>The 3D brain could not start.</b>
        <p>{this.state.err}</p>
      </div>
    ) : (
      this.props.children
    );
  }
}

/** The brain takes the main space; chat stays nearby and settings open only when needed. */
const SYNC_EVERY_MS = 60 * 60 * 1000;

export default function Home() {
  const { user, logout } = useAuth(),
    inspectedBot = useStore(s => s.inspectedBot),
    inspectBot = useStore(s => s.inspectBot);
  const admin = user?.role === 'admin';
  const [settingsOpen, setSettingsOpen] = useState(false),
    [chatOpen, setChatOpen] = useState(true),
    [resetView, setResetView] = useState(0);
  const status = useStore(s => s.status);
  // the Handoffs bar shows only when there is a handoff to list
  const hasFlow = useStore(s => (s.viewing?.flow || s.flow).length > 0);
  // Memory keeps itself up to date (Owner, Nov 1 2026: "the user should not have to update the memory or add tasks"):
  // with a saved key, Dream files whatever waits in the inbox about once an hour, checked every few minutes.
  const ready = useStore(s => !!s.keys[s.live.provider] || Object.values(s.keys).some(Boolean));
  useEffect(() => {
    if (!admin || !ready) return;
    const run = () => {
      const st = useStore.getState();
      if (!st.busy && !st.dreaming && dreamDue(st.mem, Date.now())) void st.dream(true);
    };
    run();
    const t = setInterval(run, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [admin, ready]);
  // GitHub auto-sync (Owner, Nov 1 2026: "I shouldn't have to import or sync"): while an admin has the page open
  // and a repo is set (on the live site, its own repo by default), pull only what changed when the page opens
  // and then every hour. Skipped while the team is busy or when the last sync is under an hour old.
  const repo = useStore(s => s.githubRepo);
  useEffect(() => {
    // only on the served site: a page opened from disk (tests, local preview) never reaches out on its own
    if (!admin || !repo.trim() || !globalThis.location?.protocol.startsWith('http')) return;
    const run = () => {
      const st = useStore.getState(),
        last = st.githubLastSync[st.githubRepo.trim()]?.date;
      if (st.busy || st.dreaming || (last && Date.now() - Date.parse(last) < SYNC_EVERY_MS)) return;
      void st.syncGithub({ differential: true });
    };
    const first = setTimeout(run, 3000),
      t = setInterval(run, SYNC_EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [admin, repo]);
  // Idle huddles: while an admin is signed in with a key and nothing is running, Grok Bot leads
  // short team huddles on its own small budget (lib/banter). A task, Stop or lock ends it; there is no switch.
  useEffect(() => {
    if (!admin || !ready) return;
    const t = setInterval(() => {
      const st = useStore.getState();
      // stopped stays set after Stop live — do not keep starting huddles that immediately no-op
      if (!st.busy && !st.dreaming && !st.bantering && !st.stopped) void st.banter();
    }, 5000);
    return () => clearInterval(t);
  }, [admin, ready]);
  return (
    <div className={'home single brain-first' + (chatOpen ? '' : ' chat-hidden')}>
      <section className="workspace" aria-label="Visualization">
        <main className="stage" aria-label="Brain view">
          <Boundary>
            <Suspense fallback={null}>
              <BrainScene resetView={resetView} />
            </Suspense>
          </Boundary>
          {admin && <SearchBar />}
          {admin && <MemoryList />}
          {admin && <MemoryPage />}
          {inspectedBot && <AgentInspector id={inspectedBot} onClose={() => inspectBot(null)} />}
          <div className="view-tools">
            <button
              type="button"
              onClick={() => {
                useStore.getState().select(null);
                setResetView(v => v + 1);
              }}
            >
              Reset view
            </button>
            <button
              type="button"
              aria-expanded={chatOpen}
              aria-controls="brain-chat"
              onClick={() => setChatOpen(v => !v)}
            >
              {chatOpen ? 'Hide chat' : 'Show chat'}
            </button>
            {admin && (
              <button
                type="button"
                aria-expanded={settingsOpen}
                aria-controls="brain-settings"
                onClick={() => setSettingsOpen(v => !v)}
              >
                Settings
              </button>
            )}
            <button type="button" className="icon-btn" onClick={() => logout()} aria-label="Lock" title="Lock">
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" shapeRendering="crispEdges">
                <path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <rect x="3" y="7" width="10" height="7" fill="currentColor" />
              </svg>
            </button>
          </div>
          {status && (
            <p className="workspace-status" role="status">
              {status}
            </p>
          )}
        </main>
      </section>
      {chatOpen && (
        <aside className="side" id="brain-chat">
          {hasFlow && (
            <details className="handoff-summary">
              <summary>Handoffs</summary>
              <FlowPane />
            </details>
          )}
          <ChatPanel />
        </aside>
      )}
      {admin && settingsOpen && (
        <section className="admin-bar settings-drawer" id="brain-settings" aria-label="Admin panel">
          <div className="settings-heading">
            <h2>Settings</h2>
            <button type="button" onClick={() => setSettingsOpen(false)}>
              Close settings
            </button>
          </div>
          <AdminPanel />
        </section>
      )}
    </div>
  );
}
