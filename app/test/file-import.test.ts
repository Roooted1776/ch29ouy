import { describe, expect, it } from 'vitest';
import {
  parseJsonMemory,
  parseMarkdownMemory,
  parseCsvMemory,
  importMemoryItems,
  exportMemoryJson,
  exportMemoryMarkdown,
} from '../src/lib/file-import';
import { blankMem, sanitizeMem, type Mem, type Source } from '../src/lib/memory';

describe('file-import', () => {
  describe('parseJsonMemory', () => {
    it('parses standard entries array', () => {
      const json = JSON.stringify({
        entries: [
          { title: 'Alpha', note: 'First concept note', type: 'concept', project: 'Brain' },
          { title: 'Beta', note: 'Second entity note', type: 'entity', project: 'Core' },
        ],
      });
      const items = parseJsonMemory(json, 'DefaultProj');
      expect(items).toHaveLength(2);
      expect(items[0].title).toBe('Alpha');
      expect(items[0].note).toBe('First concept note');
      expect(items[0].type).toBe('concept');
      expect(items[0].project).toBe('Brain');
      expect(items[1].project).toBe('Core');
    });

    it('parses raw array of objects', () => {
      const json = JSON.stringify([{ name: 'Model Routing', content: 'Grok leads, Claude reasons' }]);
      const items = parseJsonMemory(json, 'Brain');
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Model Routing');
      expect(items[0].note).toBe('Grok leads, Claude reasons');
    });

    it('parses key-value dictionary', () => {
      const json = JSON.stringify({
        'Supervised Fine-Tuning': 'Training with input-output pairs.',
        'Reinforcement Learning': 'Policy optimization with rewards.',
      });
      const items = parseJsonMemory(json, 'Research');
      expect(items).toHaveLength(2);
      expect(items.map(i => i.title)).toContain('Supervised Fine-Tuning');
      expect(items[0].project).toBe('Research');
    });

    it('returns empty array on invalid JSON', () => {
      expect(parseJsonMemory('{ not valid json', 'Brain')).toEqual([]);
    });
  });

  describe('parseMarkdownMemory', () => {
    it('parses multi-heading markdown into separate entries', () => {
      const md = `
# System Architecture
The system uses Zustand with Supabase sync and 3D force nodes.

# Error Recovery
Quota errors trigger automatic agent failover to preserve budget.
      `.trim();
      const items = parseMarkdownMemory(md, 'architecture.md', 'Architecture');
      expect(items).toHaveLength(2);
      expect(items[0].title).toBe('System Architecture');
      expect(items[0].note).toContain('Zustand with Supabase');
      expect(items[1].title).toBe('Error Recovery');
      expect(items[1].note).toContain('Quota errors trigger');
    });

    it('parses single-document markdown using filename as fallback', () => {
      const md = 'Brain nodes connect memory items to active project clusters.';
      const items = parseMarkdownMemory(md, 'brain-nodes.md', 'Brain');
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('brain nodes');
      expect(items[0].note).toBe(md);
    });
  });

  describe('parseCsvMemory', () => {
    it('parses CSV with headers', () => {
      const csv = `title,note,type,project\n"Vector Search","Embeddings index with cosine similarity",concept,Search\n"Postgres Vault","AES-256 encrypted database table",entity,Storage`;
      const items = parseCsvMemory(csv, 'Default');
      expect(items).toHaveLength(2);
      expect(items[0].title).toBe('Vector Search');
      expect(items[0].note).toBe('Embeddings index with cosine similarity');
      expect(items[0].type).toBe('concept');
      expect(items[0].project).toBe('Search');
      expect(items[1].project).toBe('Storage');
    });
  });

  describe('importMemoryItems & export', () => {
    const reload = (m: Mem) => sanitizeMem(JSON.parse(exportMemoryJson(m)))!;

    it('keeps identical titles in different projects separate through import, export and reload', () => {
      const m = blankMem();
      const source: Source = {
        kind: 'tool',
        label: 'Read-only project sync',
        ref: 'file:///Users/owner/Projects/Alpha/README.md',
      };
      const items = parseJsonMemory(
        JSON.stringify({
          memories: [
            { title: 'Build status', note: 'Alpha is ready.', project: 'Alpha', sources: [source] },
            { title: 'Build status', note: 'Beta needs a review.', project: 'Beta' },
          ],
        }),
      );
      importMemoryItems(m, items, 'Brain', 1000);
      const back = reload(m);
      const statuses = back.entries.filter(e => e.title === 'Build status');
      expect(statuses).toHaveLength(2);
      expect(statuses.find(e => e.project === 'Alpha')?.note).toBe('Alpha is ready.');
      expect(statuses.find(e => e.project === 'Alpha')?.sources).toEqual([source]);
      expect(statuses.find(e => e.project === 'Beta')?.note).toBe('Beta needs a review.');
      for (const e of statuses)
        expect(back.entries.find(p => p.key === `project:${e.project?.toLowerCase()}`)?.links).toContain(e.id);
    });

    it('preserves every character of long imported notes in linked pages that survive repeated reloads', () => {
      const m = blankMem();
      const note = 'Detailed evidence '.repeat(130) + 'End of the complete document.';
      const items = parseMarkdownMemory(`# Detailed report\n${note}`, 'report.md', 'Alpha');
      expect(items[0].note).toBe(note);
      importMemoryItems(m, items, 'Brain', 1000);
      let back = reload(m);
      const pages = back.entries.filter(e => e.key.startsWith('import:'));
      expect(pages.length).toBeGreaterThan(2);
      expect(pages.map(e => e.note).join('')).toBe(note);
      expect(pages.every(e => e.note.length <= 600 && e.project === 'Alpha')).toBe(true);
      expect(pages.slice(1).every(e => e.links.includes(pages[0].id))).toBe(true);
      const count = back.entries.length;
      importMemoryItems(back, items, 'Brain', 2000);
      back = reload(back);
      expect(back.entries).toHaveLength(count);
      expect(
        back.entries
          .filter(e => e.key.startsWith('import:'))
          .map(e => e.note)
          .join(''),
      ).toBe(note);
    });

    it('keeps appended evidence beyond 600 characters rather than dropping the entry on reload', () => {
      const m = blankMem();
      const before = 'First finding. '.repeat(38);
      const after = 'Additional evidence. '.repeat(35);
      importMemoryItems(m, [{ title: 'Evidence', note: before }], 'Alpha', 1000);
      importMemoryItems(m, [{ title: 'Evidence', note: after }], 'Alpha', 2000);
      const back = reload(m);
      expect(
        back.entries
          .filter(e => e.key.startsWith('import:'))
          .map(e => e.note)
          .join(''),
      ).toBe(`${before.trim()}\n\n${after.trim()}`);
    });

    it('preserves safe JSON source references while rejecting script URLs and invalid source types', () => {
      const [item] = parseJsonMemory(
        JSON.stringify({
          Record: {
            note: 'Source checked.',
            sources: [
              { kind: 'github', label: 'Repository', ref: 'https://github.com/owner/repo' },
              { kind: 'file', label: 'Local note', ref: 'file:///Users/owner/Project%20One/README.md' },
              { kind: 'file', label: 'Unsafe URL', ref: 'javascript:alert(1)' },
              { kind: 'invalid', label: 'Unknown source', ref: 'https://example.com/' },
            ],
          },
        }),
      );
      expect(item.sources).toHaveLength(3);
      expect(item.sources?.map(s => s.ref)).toEqual([
        'https://github.com/owner/repo',
        'file:///Users/owner/Project%20One/README.md',
        null,
      ]);
    });

    it('keeps a deleted import blocked instead of recreating it on the next sync', async () => {
      const { deleteEntry } = await import('../src/lib/learn');
      const m = blankMem();
      const item = { title: 'Retired tool', note: 'No longer used.' };
      importMemoryItems(m, [item], 'Tools', 1000);
      deleteEntry(m, m.entries.find(e => e.title === item.title)!.id);
      expect(importMemoryItems(m, [item], 'Tools', 2000).total).toBe(0);
      expect(reload(m).entries.some(e => e.title === item.title)).toBe(false);
    });

    it('merges new items and updates existing ones', () => {
      const mem: Mem = blankMem();
      const items = [
        { title: 'Quantum Computing', note: 'Qubits in superposition', type: 'concept' as const },
        {
          title: 'Quantum Computing',
          note: 'Entanglement allows parallel state computation',
          type: 'concept' as const,
        },
      ];

      const res = importMemoryItems(mem, items, 'Physics', 1000);
      expect(res.added).toBe(1);
      expect(res.updated).toBe(1);
      expect(res.total).toBe(2);

      const entry = mem.entries.find(e => e.title === 'Quantum Computing');
      expect(entry).toBeDefined();
      expect(entry?.note).toContain('Qubits in superposition');
      expect(entry?.note).toContain('Entanglement allows');

      // Export JSON
      const jsonStr = exportMemoryJson(mem);
      const parsed = JSON.parse(jsonStr);
      expect(parsed.entries).toHaveLength(mem.entries.length);

      // Export Markdown
      const mdStr = exportMemoryMarkdown(mem);
      expect(mdStr).toContain('# Quantum Computing');
    });
  });
});
