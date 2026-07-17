import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import en from '@/messages/en.json';

/**
 * i18n finalization (plan §Month 12; §17 #15 locked English-only + a scaffold).
 *
 * The risk with next-intl is not translation quality — it's a `t('some.key')`
 * whose key was renamed or never added: next-intl throws at render time, so a
 * missing key is a crashed screen, and only on the route that uses it. This walks
 * the source for translation calls and asserts every key resolves in en.json.
 */

const SRC_DIRS = ['app', 'components', 'features', 'lib'];
const IGNORE = /node_modules|\.next/;

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (IGNORE.test(full)) continue;
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const resolve = (obj: unknown, dotted: string): unknown =>
  dotted.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);

/**
 * Collect (namespace, key) pairs. Handles the two shapes in this codebase:
 *   const t = useTranslations('shell');  … t('theme')
 *   const t = await getTranslations('profile'); … t('title')
 * Dynamic keys (template literals / variables) are skipped — they can't be
 * checked statically, and the codebase uses literals everywhere.
 */
function keysIn(source: string): string[] {
  const ns = [...source.matchAll(/(?:useTranslations|getTranslations)\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]);
  if (ns.length === 0) return [];
  const calls = [...source.matchAll(/\bt\(\s*'([^']+)'/g)].map((m) => m[1]);
  // A file usually has one namespace; when it has several, accept a key that
  // resolves under ANY of them rather than guess which `t` it belongs to.
  return calls.flatMap((key) => ns.map((n) => `${n}.${key}`));
}

describe('i18n key coverage', () => {
  const files = SRC_DIRS.flatMap((d) => walk(path.join(process.cwd(), d)));

  it('finds translation call sites to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('every t() key used in the app resolves in messages/en.json', () => {
    const missing: string[] = [];

    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      const nsList = [...source.matchAll(/(?:useTranslations|getTranslations)\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]);
      if (!nsList.length) continue;
      const calls = [...source.matchAll(/\bt\(\s*'([^']+)'/g)].map((m) => m[1]);

      for (const key of calls) {
        const resolvesSomewhere = nsList.some((n) => typeof resolve(en, `${n}.${key}`) === 'string');
        if (!resolvesSomewhere) {
          missing.push(`${path.relative(process.cwd(), file)}: ${nsList.join('|')}.${key}`);
        }
      }
    }

    expect(missing, `Missing i18n keys:\n${missing.join('\n')}`).toEqual([]);
  });

  it('the accessibility namespace added in Month 12 is complete', () => {
    for (const k of ['title', 'subtitle', 'textureLabel', 'textureHelp']) {
      expect(typeof resolve(en, `a11y.${k}`), `a11y.${k}`).toBe('string');
    }
  });

  it('every nav item has a label key', () => {
    const nav = fs.readFileSync(path.join(process.cwd(), 'components/app-shell/nav-config.ts'), 'utf8');
    const labelKeys = [...nav.matchAll(/labelKey:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(labelKeys.length).toBeGreaterThan(0);
    for (const key of labelKeys) {
      expect(typeof resolve(en, key), `nav labelKey ${key}`).toBe('string');
    }
  });
});

// Keep the helper exercised so it can't rot silently.
describe('keysIn helper', () => {
  it('pairs each call with its namespace', () => {
    expect(keysIn("const t = useTranslations('shell');\nt('theme');")).toEqual(['shell.theme']);
  });
});
