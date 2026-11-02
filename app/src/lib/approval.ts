// Security rule (approved by Director): the old approval phrase must never trigger git or deploy.
// The app has no way to mark a PR ready, so an approval is only recorded as state; nothing runs.

/** The old phrase. Kept only so old saved sessions can be recognised and hidden; it never triggers anything. */
export const LEGACY_APPROVAL_PHRASE =
  'squash push merge all main remove all branches post merge make sure to commit and deploy';

/** Recorded approval state: ready for Director's review. No git or deploy action follows it. */
export const APPROVED_FOR_DIRECTOR_REVIEW = 'APPROVED_PENDING_DIRECTOR_REVIEW';

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim();

/** True only for the exact old phrase, ignoring case, punctuation and whitespace. */
export function isLegacyApprovalPhrase(text: string | undefined | null): boolean {
  if (!text) return false;
  return norm(text) === norm(LEGACY_APPROVAL_PHRASE);
}

/**
 * Robust extraction of failure verdicts from Grok Bot's final message.
 * Matches structured decisions (DECISION/VERDICT/RECOMMENDATION: PASS/FAIL/DECLINE/BLOCKED)
 * while ignoring negated phrases such as "no tests failed" or "zero checks failed".
 */
export function hasFailureVerdict(text: string): boolean {
  if (!text) return false;

  // 1. Structured decision matching
  const decisionMatches = Array.from(
    text.matchAll(/(?:DECISION|VERDICT|RECOMMENDATION):\s*(PASS|FAIL|DECLINE|DECLINED|BLOCKED)/gi),
  );
  if (decisionMatches.length > 0) {
    const hasFailDecision = decisionMatches.some(m =>
      ['FAIL', 'DECLINE', 'DECLINED', 'BLOCKED'].includes(m[1].toUpperCase()),
    );
    if (hasFailDecision) return true;
    const hasPassDecision = decisionMatches.some(m => m[1].toUpperCase() === 'PASS');
    if (hasPassDecision) return false;
  }

  // 2. Strip negated failure phrases so statements like "no tests failed", "zero checks failed",
  // or hyphenated forms like "zero-failure run" do not trigger a false decline.
  const stripped = text.replace(
    /\b(?:no|zero|0|without|not|never|none|nothing)[\s-]+(?:\w+[\s-]+){0,3}(?:fail|failed|failure|failures|decline|declined|declines|reject|rejected|rejects|block|blocked|blockers?|abort|aborted)\b/gi,
    ' ',
  );

  // 3. Fallback: check remaining un-negated failure indicators
  return /\b(fail|failed|failure|decline|declined|declines|reject|rejected|rejects|block|blocked|abort|aborted)\b/i.test(
    stripped,
  );
}

/** The value saved as the final review. Only records state; it is data, never a command. */
export function finalReviewFor(hasFailures: boolean, lastGrokBotMsg?: string): string {
  if (hasFailures || (lastGrokBotMsg && hasFailureVerdict(lastGrokBotMsg))) {
    return 'DECLINED: Blocked based on team response.';
  }
  return APPROVED_FOR_DIRECTOR_REVIEW;
}
