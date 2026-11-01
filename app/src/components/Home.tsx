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
export default function Home() {
  const { user, logout } = useAuth(),
    inspectedBot = useStore(s => s.inspectedBot),
    inspectBot = useStore(s => s.inspectBot);
  const admin = user?.role === 'admin';
  const [settingsOpen, setSettingsOpen] = useState(false),
    [chatOpen, setChatOpen] = useState(true),
    [resetView, setResetView] = useState(0);
  const status = useStore(s => s.status);
  // Dream runs by itself at most once a day, after sign-in, when something waits in the inbox
  const ready = useStore(s => !!s.keys[s.live.provider] || Object.values(s.keys).some(Boolean)),
    due = useStore(s => dreamDue(s.mem, Date.now()));
  useEffect(() => {
    if (admin && ready && due) void useStore.getState().dream(true);
  }, [admin, ready, due]);
  // GitHub auto-sync: while an admin has the page open and a repo is set, pull only what changed every 12 hours
  const repo = useStore(s => s.githubRepo);
  useEffect(() => {
    if (!admin || !repo.trim()) return;
    const t = setInterval(
      () => {
        const st = useStore.getState();
        if (!st.busy) void st.syncGithub({ differential: true });
      },
      12 * 60 * 60 * 1000,
    );
    return () => clearInterval(t);
  }, [admin, repo]);
  // Idle huddles: while an admin is signed in with a key and nothing is running, Grok Bot leads
  // short team huddles on its own small budget (lib/banter). A task, Stop, lock or the switch ends it.
  const banterOn = useStore(s => s.live.banter);
  useEffect(() => {
    if (!admin || !ready || !banterOn) return;
    const t = setInterval(() => {
      const st = useStore.getState();
      // stopped stays set after Stop live — do not keep starting huddles that immediately no-op
      if (!st.busy && !st.dreaming && !st.bantering && !st.stopped) void st.banter();
    }, 5000);
    return () => clearInterval(t);
  }, [admin, ready, banterOn]);
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
          <details className="handoff-summary">
            <summary>Handoffs</summary>
            <FlowPane />
          </details>
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
