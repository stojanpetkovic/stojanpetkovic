import { describe, expect, it } from 'vitest';
import { spamVerdict, MIN_FILL_MS } from '../lib/spam';

describe('contact form spam checks', () => {
  const now = 1_800_000_000_000;

  it('refuses a post that never ran the page', () => {
    expect(spamVerdict({ message: 'Hello there, I need a website' }, now)).toBe('missing');
    expect(spamVerdict({ started: 'abc' }, now)).toBe('missing');
  });

  it('drops a form filled in faster than a person could', () => {
    expect(spamVerdict({ started: String(now - 800) }, now)).toBe('spam');
  });

  it('drops a message stuffed with links', () => {
    const message = 'Buy http://a.com http://b.com www.c.com https://d.com';
    expect(spamVerdict({ started: String(now - 60_000), message }, now)).toBe('spam');
  });

  it('lets a person through', () => {
    const message = 'We are a roofing company in Tampa, our site is www.example.com';
    expect(spamVerdict({ started: String(now - MIN_FILL_MS - 1), message }, now)).toBeNull();
  });
});
