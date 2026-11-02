import { absorbMemory, type AbsorbResult } from './absorb';
import { archiveRetiredToolNodes } from './project-sync';
import type { Mem } from './memory';

export type SyncCounts = Pick<AbsorbResult, 'added' | 'updated' | 'sessions'>;

/** Status line after a memory pull. Clean-only syncs say so instead of "absorbed 0…". */
export function formatMemorySyncStatus(r: SyncCounts, cleaned: number): string {
  if (cleaned && !(r.added || r.updated || r.sessions))
    return `Memory sync: cleaned up ${cleaned} node(s) for removed tools; they stay in the archive.`;
  return `Memory sync: absorbed ${r.added} new, ${r.updated} updated, ${r.sessions} session(s) from other agents.`;
}

export interface MemoryPullResult {
  next: Mem;
  r: AbsorbResult;
  cleaned: number;
  /** Non-null when the local vault should take the merged copy. */
  status: string | null;
  /** True when only nextId / nextSession need a bump (no entry or session change). */
  bumpIdsOnly: boolean;
}

/**
 * Absorb another agent's database copy, then archive removed-tool nodes.
 * Pure: no network. Caller commits `next` or bumps ids when told to.
 */
export function applyMemorySyncPull(cur: Mem, back: Mem): MemoryPullResult {
  const next = structuredClone(cur);
  const r = absorbMemory(next, back);
  const cleaned = archiveRetiredToolNodes(next);
  const changed = !!(r.added || r.updated || r.sessions || cleaned);
  return {
    next,
    r,
    cleaned,
    status: changed ? formatMemorySyncStatus(r, cleaned) : null,
    bumpIdsOnly: !changed && (next.nextSession > cur.nextSession || next.nextId > cur.nextId),
  };
}
