import { normaliseFolderPath, isSafeFolderPath, safeFolderPath } from '../src/ingest/folder-path';

/**
 * Upload folder validation (M19 W5).
 *
 * The folder ROUTES data to a customer, so it is untrusted input: a traversal
 * segment could point one customer's batch at another's station. These are the
 * cases that must never be accepted.
 */

describe('normaliseFolderPath', () => {
  it('strips the leading and trailing slashes', () => {
    expect(normaliseFolderPath('/Observator/Demo Tower/')).toBe('Observator/Demo Tower');
  });

  it('collapses duplicate separators', () => {
    expect(normaliseFolderPath('Observator//Demo Tower')).toBe('Observator/Demo Tower');
  });

  it('accepts Windows separators — the logger runs on Windows', () => {
    expect(normaliseFolderPath('Observator\\Demo Tower')).toBe('Observator/Demo Tower');
  });

  it('treats the flat layout as an empty path', () => {
    expect(normaliseFolderPath('')).toBe('');
    expect(normaliseFolderPath('/')).toBe('');
    expect(normaliseFolderPath(null)).toBe('');
    expect(normaliseFolderPath(undefined)).toBe('');
  });

  it('preserves case and spaces — `Demo Tower` is the real folder name', () => {
    expect(normaliseFolderPath('Observator/Demo Tower')).toBe('Observator/Demo Tower');
  });
});

describe('isSafeFolderPath', () => {
  it('accepts the agreed two-level layout', () => {
    expect(isSafeFolderPath('Observator/Demo Tower')).toBe(true);
  });

  it('accepts the flat legacy layout', () => {
    expect(isSafeFolderPath('')).toBe(true);
  });

  it('accepts names with dots, dashes, underscores and brackets', () => {
    expect(isSafeFolderPath('Acme Ltd. (NSW)/Tower_02-B')).toBe(true);
  });

  it('REJECTS traversal in every position', () => {
    for (const p of ['..', '../etc', 'Observator/..', 'Observator/../Other', 'a/../../b', '../']) {
      expect([p, isSafeFolderPath(p)]).toEqual([p, false]);
    }
  });

  it('rejects a bare current-directory segment', () => {
    expect(isSafeFolderPath('.')).toBe(false);
    expect(isSafeFolderPath('Observator/./Tower')).toBe(false);
  });

  it('rejects a colon, so a drive-qualified path cannot become a folder name', () => {
    expect(isSafeFolderPath('C:/data')).toBe(false);
  });

  it('rejects a null byte', () => {
    expect(isSafeFolderPath('Observator/Tower\0')).toBe(false);
  });

  it('rejects unbounded nesting', () => {
    expect(isSafeFolderPath('a/b/c')).toBe(true);
    expect(isSafeFolderPath('a/b/c/d')).toBe(false);
  });

  it('rejects an absurdly long path', () => {
    expect(isSafeFolderPath('x'.repeat(201))).toBe(false);
  });

  it('rejects shell and glob metacharacters', () => {
    for (const p of ['Tower;rm -rf', 'Tower$(id)', 'Tower*', 'Tower|cat', 'Tower&']) {
      expect([p, isSafeFolderPath(p)]).toEqual([p, false]);
    }
  });
});

describe('safeFolderPath', () => {
  it('normalises then validates in one step', () => {
    expect(safeFolderPath('/Observator/Demo Tower/')).toBe('Observator/Demo Tower');
  });

  it('returns null for anything unusable, never a "cleaned" guess', () => {
    // Silently rewriting `../x` into `x` would route a batch somewhere the
    // caller never named — rejection is the only safe answer.
    expect(safeFolderPath('../Other Customer')).toBeNull();
  });

  it('strips a leading slash rather than rejecting it', () => {
    // `/upload/Demo Tower` is how the client's logger expresses the folder, and
    // it cannot be distinguished from an "absolute" path by inspection. Safety
    // comes from the value being only a lookup key: an unregistered path
    // resolves to UNKNOWN_STATION.
    expect(safeFolderPath('/etc/passwd')).toBe('etc/passwd');
  });

  it('rejects a drive-qualified Windows path, which cannot be a folder name', () => {
    expect(safeFolderPath('C:\\data\\upload')).toBeNull();
  });

  it('maps the flat layout to an empty string, not null', () => {
    expect(safeFolderPath(undefined)).toBe('');
  });
});
