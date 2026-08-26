import { brandedFilename, csvProvenance, filenameSafe } from '../src/utils/export-branding.util';

/**
 * Branding on exports (M20 W4).
 *
 * An exported CSV is the one artefact that outlives the session and gets
 * emailed around. Once several customers share the platform, an unlabelled
 * `MET-Link-2026-08-25.csv` is how one customer's readings end up quoted in
 * another customer's report.
 */

describe('filenameSafe', () => {
  it('turns a company name into something safe on any filesystem', () => {
    expect(filenameSafe('Acme Marine Services')).toBe('Acme-Marine-Services');
  });

  it('strips characters that break a path or a shell', () => {
    for (const bad of ['a/b', 'a\\b', 'a:b', 'a*b', 'a?b', 'a"b', 'a<b', 'a|b']) {
      expect(filenameSafe(bad)).not.toMatch(/[/\\:*?"<>|]/);
    }
  });

  it('collapses runs of spaces and dashes rather than leaving gaps', () => {
    expect(filenameSafe('Acme   ---   Marine')).toBe('Acme-Marine');
  });

  it('never leaves a leading or trailing dash or dot', () => {
    // `.hidden` files and `-flag`-looking names are both worth avoiding.
    expect(filenameSafe('  -Acme-  ')).toBe('Acme');
    expect(filenameSafe('...Acme...')).toBe('Acme');
  });

  it('caps the length, so a long name cannot break the filesystem limit', () => {
    expect(filenameSafe('X'.repeat(200)).length).toBeLessThanOrEqual(48);
  });

  it('returns empty when nothing survives, rather than a stub', () => {
    // The caller then falls back to the plain name instead of `--2026-08-25.csv`.
    expect(filenameSafe('///')).toBe('');
    expect(filenameSafe('')).toBe('');
  });

  it('keeps accented letters legible instead of mangling them', () => {
    expect(filenameSafe('Ångström Marine')).toMatch(/ngstrom-Marine|Angstrom-Marine/);
  });
});

describe('brandedFilename', () => {
  it('prefixes the customer name', () => {
    expect(brandedFilename('Acme Marine', 'MET-Link-2026-08-25', 'csv')).toBe(
      'Acme-Marine-MET-Link-2026-08-25.csv',
    );
  });

  it('falls back to the plain name for an unbranded customer', () => {
    expect(brandedFilename('', 'MET-Link-2026-08-25', 'csv')).toBe('MET-Link-2026-08-25.csv');
  });

  it('does not double the separator when the label sanitises away', () => {
    expect(brandedFilename('///', 'export', 'zip')).toBe('export.zip');
  });
});

describe('csvProvenance', () => {
  it('names the customer and when the file was made', () => {
    const line = csvProvenance('Acme Marine', new Date('2026-08-25T00:00:00Z'));
    expect(line).toBe('# Acme Marine — exported 2026-08-25T00:00:00.000Z');
  });

  it('starts with # so parsers skip it instead of reading it as a header', () => {
    // Not RFC 4180, but Excel, Pandas and R all skip a leading comment — and the
    // alternative, a second header row, actively breaks them.
    expect(csvProvenance('Acme')).toMatch(/^#/);
  });

  it('is a single line, so it cannot shift the real header down', () => {
    // A display name is length-capped but not newline-free. One embedded here
    // would push the header row down and break every parser reading the file.
    expect(csvProvenance('Acme\nMarine').split('\n')).toHaveLength(1);
    expect(csvProvenance('Acme\r\nMarine')).toContain('Acme Marine');
  });
});
