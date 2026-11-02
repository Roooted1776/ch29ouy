/**
 * Tools Brain no longer uses. One shared list for node cleanup and old chat labels.
 * Keep 'cerebras' / 'Cerebras (free)' until Owner says to drop the compatibility.
 */

/** Exact entity titles (matched case-insensitively) archived on sign-in and sync. */
export const RETIRED_TOOL_TITLES = ['freebuff', 'archil', 'comet', 'cerebras'] as const;

/** Old provider labels that must still parse when loading saved chat sessions. */
export const RETIRED_CHAT_LABELS = ['Freebuff (free)', 'Cerebras (free)'] as const;
