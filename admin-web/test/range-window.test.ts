import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rangeWindow, RANGE_PRESETS } from '@/lib/time/range-window';

/**
 * Rolling presets are instants; calendar presets are local.
 *
 * "Last hour" is the same 60 minutes everywhere on earth, so it needs no
 * timezone. "Today" is whatever the VIEWER's calendar says — which is the whole
 * reason the two families exist separately: a portal used from several countries
 * cannot pin "today" to whoever installed it.
 */
const H = 3_600_000;
const NOW = Date.UTC(2026, 8, 8, 14, 37, 12); // 8 Sep 2026, 14:37 UTC

describe('rolling presets', () => {
  it('end at NOW and reach exactly the preset length back', () => {
    expect(rangeWindow('1h', NOW)).toEqual({ from: NOW - H, to: NOW });
    expect(rangeWindow('24h', NOW)).toEqual({ from: NOW - 24 * H, to: NOW });
    expect(rangeWindow('7d', NOW)).toEqual({ from: NOW - 7 * 24 * H, to: NOW });
  });

  it('leave the lower bound open for all time', () => {
    expect(rangeWindow('all', NOW)).toEqual({ to: NOW });
  });
});

describe('calendar presets, in whatever zone the runtime is in', () => {
  it('start exactly at local midnight', () => {
    const d = new Date(rangeWindow('today', NOW).from!);
    expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([0, 0, 0, 0]);
    // ...and it is TODAY's midnight, not some other day's.
    expect(d.getDate()).toBe(new Date(NOW).getDate());
  });

  it('never double-count: yesterday ends where today begins', () => {
    const today = rangeWindow('today', NOW);
    const yesterday = rangeWindow('yesterday', NOW);
    expect(yesterday.to).toBe(today.from);
    expect(today.to).toBe(NOW);
  });

  it('span seven local days for last7days', () => {
    const w = rangeWindow('last7days', NOW);
    const today = rangeWindow('today', NOW);
    // Six whole days plus today. Compared in DAYS rather than milliseconds so a
    // DST transition inside the span does not fail a correct result.
    const days = Math.round((today.from! - w.from!) / (24 * H));
    expect(days).toBe(6);
    expect(w.to).toBe(NOW);
  });
});

describe('the preset catalogue', () => {
  it('gives every preset a kind, so the picker can group them', () => {
    for (const p of RANGE_PRESETS) expect(['rolling', 'day']).toContain(p.kind);
  });

  it('keeps a rolling AND a calendar seven-day option, resolving differently', () => {
    // They are genuinely different windows, which is why the picker groups them
    // rather than offering "Last 7 days" twice with nothing to tell them apart.
    expect(rangeWindow('7d', NOW).from).not.toBe(rangeWindow('last7days', NOW).from);
  });
});

/**
 * The claim that matters: the SAME instant produces a DIFFERENT "today"
 * depending on where the viewer is.
 *
 * This cannot be tested in-process — V8 caches the timezone on first use, and by
 * the time a test runs the cache is long warm, so reassigning `process.env.TZ`
 * changes nothing. Each zone therefore gets a real subprocess. The module is
 * bundled from source rather than reimplemented, so this exercises the shipping
 * code and not a copy of it.
 */
describe('calendar presets follow the VIEWER, not the server', () => {
  const dir = mkdtempSync(join(tmpdir(), 'range-tz-'));
  const bundle = join(dir, 'range-window.cjs');

  // esbuild's own CLI, run as a subprocess: its API refuses to load inside
  // jsdom (it asserts on a real TextEncoder, which the DOM environment shims).
  execFileSync(
    join('node_modules', '.bin', 'esbuild'),
    ['lib/time/range-window.ts', `--outfile=${bundle}`, '--bundle', '--platform=node', '--format=cjs'],
    { encoding: 'utf8' },
  );

  const todayStartIn = (tz: string, at: number = NOW): number =>
    Number(
      execFileSync(
        process.execPath,
        ['-e', `const m=require(${JSON.stringify(bundle)});process.stdout.write(String(m.rangeWindow('today',${at}).from))`],
        { env: { ...process.env, TZ: tz }, encoding: 'utf8' },
      ),
    );

  it('resolves each viewer’s own midnight', () => {
    // At 14:37 UTC it is already Sep 9 in Sydney while it is still Sep 8 in
    // Karachi and New York — so "today" is a DIFFERENT DATE for each of them,
    // which is exactly the behaviour a multi-country portal needs.
    //
    // Karachi (UTC+5): Sep 8 local → 19:00 UTC on Sep 7.
    expect(todayStartIn('Asia/Karachi')).toBe(Date.UTC(2026, 8, 7, 19, 0, 0));
    // Sydney (UTC+10): already Sep 9 local → 14:00 UTC on Sep 8.
    expect(todayStartIn('Australia/Sydney')).toBe(Date.UTC(2026, 8, 8, 14, 0, 0));
    // New York (UTC−4 in September): Sep 8 local → 04:00 UTC the same day.
    expect(todayStartIn('America/New_York')).toBe(Date.UTC(2026, 8, 8, 4, 0, 0));
  });

  it('differs by exactly the offset when both viewers are on the same date', () => {
    // Measured at 06:00 UTC, where Karachi (11:00) and Sydney (16:00) share a
    // calendar date. Across a date boundary the gap is NOT the offset — see the
    // test above — so the instant is chosen deliberately rather than reused.
    const sameDate = Date.UTC(2026, 8, 8, 6, 0, 0);
    const karachi = todayStartIn('Asia/Karachi', sameDate);
    const sydney = todayStartIn('Australia/Sydney', sameDate);
    expect(karachi - sydney).toBe(5 * H);
  });

  it('does not skip a day in the hour after a spring-forward', () => {
    /**
     * Sydney springs forward at 02:00 on Sun 4 Oct 2026, so Oct 4 is 23 hours
     * long. Measured at 00:30 on Oct 5 — INSIDE the hour the clock lost.
     *
     * This instant is chosen deliberately: at midday the naive
     * `now − 86,400,000` happens to land on the right date and the bug hides.
     * Here it does not — subtracting a fixed 24 hours reaches 23:30 on Oct 3,
     * so "yesterday" silently becomes Oct 3 and Oct 4 disappears from the
     * portal for an hour, once a year.
     */
    const justAfterMidnight = Date.UTC(2026, 9, 4, 13, 30, 0); // 00:30 Sydney, Oct 5
    const pair = execFileSync(
      process.execPath,
      [
        '-e',
        `const m=require(${JSON.stringify(bundle)});` +
          `const t=m.rangeWindow('today',${justAfterMidnight}).from,y=m.rangeWindow('yesterday',${justAfterMidnight}).from;` +
          `process.stdout.write(t+','+y)`,
      ],
      { env: { ...process.env, TZ: 'Australia/Sydney' }, encoding: 'utf8' },
    );
    const [today, yesterday] = pair.split(',').map(Number);

    // Yesterday is Oct 4 — the short day itself, not the day before it.
    expect(yesterday).toBe(Date.UTC(2026, 9, 3, 14, 0, 0)); // Oct 4 00:00 AEST
    expect(today).toBe(Date.UTC(2026, 9, 4, 13, 0, 0)); // Oct 5 00:00 AEDT
    // And the day between them really is 23 hours long.
    expect(today - yesterday).toBe(23 * H);
  });

  it('cleans up its bundle', () => {
    rmSync(dir, { recursive: true, force: true });
  });
});
