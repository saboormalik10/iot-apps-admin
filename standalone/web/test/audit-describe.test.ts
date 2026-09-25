import { describe, it, expect } from 'vitest';
import { describeEntry, TONE_CLASS } from '@/features/audit/describe-entry';

/**
 * The log stored `create` / `alertRule` / `shareToken` in separate columns and
 * showed them that way. Someone scanning for "who deleted that station" had to
 * assemble the sentence themselves, and had to know `device` means station.
 */
const e = (action: string, resourceType: string, resourceName: string | null = null) =>
  describeEntry({ action, resourceType, resourceName } as never);

describe('describeEntry', () => {
  it('names the thing the way the portal does, not the way the database does', () => {
    expect(e('create', 'device', 'Demo Tower').text).toBe('Added the station');
    expect(e('delete', 'shareToken', 'Link').text).toBe('Deleted the share link');
    expect(e('update', 'alertRule', 'High wind').text).toBe('Changed the alert rule');
    expect(e('create', 'user', 'Sam').text).toBe('Added the person');
  });

  it('keeps the name separate, so the UI can weight it', () => {
    const d = e('delete', 'device', 'Demo Tower');
    expect(d.name).toBe('Demo Tower');
    expect(d.text).not.toContain('Demo Tower');
  });

  it('says "a" when nothing was named', () => {
    expect(e('create', 'device').text).toBe('Added a station');
    expect(e('create', 'device').name).toBeNull();
  });

  it('does not invent an object for sign-in and sign-out', () => {
    // "Signed in the person" is nonsense, and these are the most common rows.
    expect(e('login', 'user', 'Sam').text).toBe('Signed in');
    expect(e('logout', 'user').text).toBe('Signed out');
    expect(e('login', 'user', 'Sam').name).toBeNull();
  });

  it('colours destructive actions apart from routine ones', () => {
    expect(e('delete', 'device').tone).toBe('removed');
    expect(e('revoke', 'shareToken').tone).toBe('removed');
    expect(e('create', 'device').tone).toBe('created');
    expect(e('update', 'device').tone).toBe('changed');
  });

  it('keeps sign-ins quiet — they would otherwise drown out the writes', () => {
    // 2,386 of 6,685 rows in the live log are logins.
    expect(e('login', 'user').tone).toBe('quiet');
    expect(e('logout', 'user').tone).toBe('quiet');
  });

  it('shows an UNKNOWN resource rather than dropping it', () => {
    // A new resource type should look unpolished, never invisible.
    const d = e('create', 'somethingNew', 'X');
    expect(d.text).toBe('Added the somethingNew');
    expect(d.name).toBe('X');
  });

  it('falls back to the raw action rather than rendering nothing', () => {
    expect(e('frobnicate', 'device').text).toContain('frobnicate');
  });

  it('has a class for every tone', () => {
    for (const tone of ['created', 'changed', 'removed', 'quiet'] as const) {
      expect(TONE_CLASS[tone]).toBeTruthy();
    }
  });
});
