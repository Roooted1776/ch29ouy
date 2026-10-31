import { useCallback, useEffect, useRef, useState } from 'react';
import { sanitizeMem } from '../lib/memory';
import { archiveEmptyAndRetiredNodes, mergeProjectMirror } from '../lib/project-sync';
import { useStore } from '../store';

interface SnapshotFileHandle {
  getFile(): Promise<File>;
}
interface SnapshotPickerWindow extends Window {
  showOpenFilePicker?: (options: {
    multiple: false;
    excludeAcceptAllOption: true;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<SnapshotFileHandle[]>;
}

const MAX_SNAPSHOT_BYTES = 16 * 1024 * 1024;
const POLL_MS = 30_000;

/** One Owner-selected file, read-only. Persistence stays with Brain's existing encrypted vault. */
export default function ProjectSnapshotWatcher() {
  const role = useStore(s => s.role);
  const storageOk = useStore(s => s.storageOk);
  const handle = useRef<SnapshotFileHandle | null>(null);
  const generation = useRef(0);
  const reading = useRef(false);
  const lastSnapshot = useRef<{ text: string; modified: number } | null>(null);
  const [watching, setWatching] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [status, setStatus] = useState('Not watching a project snapshot.');
  const [error, setError] = useState('');

  const clearHandle = useCallback(() => {
    generation.current++;
    handle.current = null;
    lastSnapshot.current = null;
  }, []);

  const refresh = useCallback(async (fileHandle: SnapshotFileHandle, session: number) => {
    if (reading.current || useStore.getState().role !== 'admin') return;
    reading.current = true;
    const current = () =>
      generation.current === session && handle.current === fileHandle && useStore.getState().role === 'admin';
    try {
      const file = await fileHandle.getFile();
      if (!current()) return;
      if (file.size > MAX_SNAPSHOT_BYTES) throw new Error('The project snapshot exceeds the 16 MiB limit.');
      const text = await file.text();
      if (!current()) return;
      // Compare exact content, even when a file writer reuses the same timestamp.
      if (lastSnapshot.current?.text === text) {
        lastSnapshot.current.modified = file.lastModified;
        setError('');
        return;
      }
      const incoming = sanitizeMem(JSON.parse(text), true);
      if (!incoming?.entries.some(e => e.key.startsWith('source:')))
        throw new Error('Choose a generated Brain project snapshot JSON file.');

      const next = structuredClone(useStore.getState().mem);
      const result = mergeProjectMirror(next, incoming);
      const archived = archiveEmptyAndRetiredNodes(next);
      if (!current()) return;
      if (result.applied || archived) useStore.getState().commit(mem => Object.assign(mem, next));
      lastSnapshot.current = { text, modified: file.lastModified };
      setError('');
      setStatus(
        `Watching ${file.name}. ${result.projects} project(s); ${result.applied} record(s) updated${archived ? `; ${archived} retired or empty node(s) archived` : ''}.`,
      );
    } catch (err) {
      if (!current()) return;
      const message =
        err instanceof SyntaxError ? 'The snapshot is not valid JSON.' : String((err as Error)?.message || err);
      setError(`${message} Existing memory was kept.`);
    } finally {
      reading.current = false;
    }
  }, []);

  useEffect(() => {
    if (role !== 'admin') {
      clearHandle();
      setWatching(false);
      setChoosing(false);
      setError('');
      setStatus('Admin sign-in is required to watch project notes.');
      return;
    }
    const timer = setInterval(() => {
      const selected = handle.current;
      if (selected) void refresh(selected, generation.current);
    }, POLL_MS);
    return () => {
      clearInterval(timer);
      clearHandle();
    };
  }, [role, clearHandle, refresh]);

  const chooseFile = async () => {
    if (useStore.getState().role !== 'admin') return;
    const picker = (window as SnapshotPickerWindow).showOpenFilePicker;
    if (!picker) {
      setError('This browser cannot watch a selected file. Use Import Files instead.');
      return;
    }
    clearHandle();
    const session = generation.current;
    setWatching(false);
    setChoosing(true);
    setError('');
    try {
      const files = await picker.call(window, {
        multiple: false,
        excludeAcceptAllOption: true,
        types: [{ description: 'Brain project snapshot', accept: { 'application/json': ['.json'] } }],
      });
      if (generation.current !== session || useStore.getState().role !== 'admin') return;
      const selected = files[0];
      if (!selected) return;
      handle.current = selected;
      setWatching(true);
      setStatus('Watching the selected snapshot; checking for project notes.');
      await refresh(selected, session);
    } catch (err) {
      if (generation.current !== session || useStore.getState().role !== 'admin') return;
      if ((err as Error)?.name === 'AbortError') setStatus('Not watching a project snapshot.');
      else setError('The snapshot could not be opened. File permission is required; use Import Files if needed.');
    } finally {
      if (generation.current === session && useStore.getState().role === 'admin') setChoosing(false);
    }
  };

  const stop = () => {
    clearHandle();
    setWatching(false);
    setError('');
    setStatus('Not watching a project snapshot.');
  };

  return (
    <fieldset className="project-snapshot-watch" aria-label="Project snapshot watcher">
      <p className="hint2">
        Read only the generated snapshot file you choose, every 30 seconds while signed in as admin. Browser file
        permission is required. Other browsers can use Import Files. This cannot edit your project folders.
      </p>
      <div className="row">
        <button type="button" disabled={role !== 'admin' || choosing} onClick={() => void chooseFile()}>
          Watch project notes
        </button>
        {watching && (
          <button type="button" onClick={stop}>
            Stop watching
          </button>
        )}
      </div>
      <p role="status">{status}</p>
      {error && <p role="alert">{error}</p>}
      {!storageOk && (
        <p role="alert">Brain could not save the latest memory. Keep this tab open and check sync status.</p>
      )}
      <p className="hint2">
        Updates use Brain's existing encrypted memory sync. No model calls are made by this watcher.
      </p>
    </fieldset>
  );
}
