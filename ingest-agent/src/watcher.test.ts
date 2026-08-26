import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { endsCleanly, looksComplete, minuteFromName } from './watcher';
import { backoffMs, chunkFiles } from './uploader';
import { AgentConfig } from './config';

/**
 * Tests for the agent's decision logic. Pure functions only — no filesystem, no
 * network. Run with `npm test` (node:test, no test framework dependency).
 *
 * These encode the reasons behind the three stability gates. Getting them wrong
 * does not throw; it silently truncates a file that will never be re-sent.
 */

describe('minuteFromName', () => {
  test('reads the minute out of both filename styles', () => {
    assert.equal(minuteFromName('WindSonic_20260820_0409.csv'), Date.UTC(2026, 7, 20, 4, 9));
    assert.equal(minuteFromName('wind_20260818_1114.csv'), Date.UTC(2026, 7, 18, 11, 14));
  });

  test('is case-insensitive on the extension', () => {
    assert.notEqual(minuteFromName('WindSonic_20260820_0409.CSV'), null);
  });

  test('returns null for anything it cannot read, rather than a wrong time', () => {
    for (const n of ['notes.csv', 'WindSonic.csv', 'WindSonic_2026082_0409.csv', 'WindSonic_20260820_9999.csv']) {
      assert.equal(minuteFromName(n), null, n);
    }
  });
});

describe('endsCleanly — gate 2', () => {
  test('accepts a file ending in CRLF or LF', () => {
    assert.equal(endsCleanly('a,b\r\n'), true);
    assert.equal(endsCleanly('a,b\n'), true);
  });

  test('rejects a file cut mid-row', () => {
    assert.equal(endsCleanly('a,b\r\n2026-08-20T04:09:01+10:00,28'), false);
  });
});

describe('looksComplete — gate 3', () => {
  const header = 'timestamp,direction,speed,units,status\r\n';

  test('accepts a file whose last row reaches the end of its minute', () => {
    assert.equal(looksComplete(header + '2026-08-20T04:09:59+10:00,291,1.80,K,A\r\n'), true);
  });

  test('rejects one that stops early — the client uploader bug', () => {
    // Real files stop anywhere from :49 to :56 because the uploader posts the
    // file while it is still being written.
    assert.equal(looksComplete(header + '2026-08-20T04:09:50+10:00,291,1.80,K,A\r\n'), false);
  });

  test('rejects a header with no data', () => {
    assert.equal(looksComplete(header), false);
  });

  test('rejects a row with no recognisable time', () => {
    assert.equal(looksComplete(header + 'garbage,291,1.80,K,A\r\n'), false);
  });
});

describe('backoffMs', () => {
  test('stays within the jittered ceiling and never exceeds five minutes', () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      for (let i = 0; i < 50; i++) {
        const d = backoffMs(attempt);
        assert.ok(d >= 0, 'never negative');
        assert.ok(d <= 300_000, `capped at 5min, got ${d}`);
      }
    }
  });

  test('grows with the attempt number', () => {
    // Full jitter means any single draw can be small; compare the ceilings via
    // a generous sample instead.
    const early = Math.max(...Array.from({ length: 200 }, () => backoffMs(0)));
    const late = Math.max(...Array.from({ length: 200 }, () => backoffMs(6)));
    assert.ok(late > early, `expected later attempts to reach higher, got ${early} vs ${late}`);
  });
});

describe('chunkFiles', () => {
  const cfg = { maxFilesPerRequest: 3, maxBytesPerRequest: 100 } as AgentConfig;
  const file = (name: string, size: number) => ({ name, content: 'x'.repeat(size), sha256: '' });

  test('splits on the file-count limit', () => {
    const batches = chunkFiles([1, 2, 3, 4, 5].map((i) => file(`f${i}`, 1)), cfg);
    assert.deepEqual(batches.map((b) => b.length), [3, 2]);
  });

  test('splits on the byte limit', () => {
    const batches = chunkFiles([file('a', 60), file('b', 60)], cfg);
    assert.equal(batches.length, 2);
  });

  test('never drops a file that is bigger than the limit on its own', () => {
    // It goes out alone and the server decides — dropping it locally would lose
    // data over a size heuristic.
    const batches = chunkFiles([file('huge', 500)], cfg);
    assert.equal(batches.length, 1);
    assert.equal(batches[0][0].name, 'huge');
  });

  test('returns nothing for no input', () => {
    assert.deepEqual(chunkFiles([], cfg), []);
  });

  test('preserves order, which is chronological by filename', () => {
    const names = ['a', 'b', 'c', 'd'].map((n) => file(n, 1));
    const flat = chunkFiles(names, cfg).flat().map((f) => f.name);
    assert.deepEqual(flat, ['a', 'b', 'c', 'd']);
  });
});
