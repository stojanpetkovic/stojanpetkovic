/**
 * Spam checks that need no outside service (the honeypot is in the schema).
 * - `started` is written by the form's script when the page opens. A post
 *   without it never ran the page (a plain bot); a post sent faster than
 *   MIN_FILL_MS was not typed by a person.
 * - A message with more than MAX_LINKS links is link spam.
 * Returns 'missing' for a post without the timestamp, 'spam' for one to drop
 * quietly, or null when it looks like a person.
 */
export const MIN_FILL_MS = 3_000;
export const MAX_LINKS = 3;
export function spamVerdict(
  data: { started?: string; message?: string },
  now = Date.now()
): 'missing' | 'spam' | null {
  const started = Number(data.started);
  if (!data.started || !Number.isFinite(started)) return 'missing';
  const elapsed = now - started;
  if (elapsed < MIN_FILL_MS) return 'spam';
  const links = (data.message ?? '').match(/https?:\/\/|www\./gi)?.length ?? 0;
  if (links > MAX_LINKS) return 'spam';
  return null;
}
