import { printable } from '../src/stream/stream.service';
import { whyNoReadings } from '../src/system/system-status.service';
import type { StreamService } from '../src/stream/stream.service';

/**
 * "Looks like is connected, BUT no data appearing" (client, 9 Oct 2026). The
 * System page could only say "0 readings"; it now says what arrived and why it
 * was not a reading.
 */
type Status = ReturnType<StreamService['getStatus']>;
const NOW = Date.parse('2026-10-09T08:00:00.000Z');

const status = (over: Partial<Status> = {}, counts: Partial<Status['counts']> = {}): Status =>
  ({
    connected: true,
    connectedAt: new Date(NOW - 60_000).toISOString(),
    readingsLastMinute: 0,
    fields: ['NODE', 'DIR', 'SPEED', 'CDIR', 'CSPEED', 'TEMP', 'RH', 'PRESS', 'PRECIPT', 'PRECIPI', 'STATUS', 'CHECK'],
    ...over,
    counts: { bytes: 0, lines: 0, checksumErrors: 0, columnMismatches: 0, unframed: 0, ...counts },
  }) as Status;

describe('why a connected sensor gives no readings', () => {
  it('says nothing arrives, once it has had time to', () => {
    expect(whyNoReadings(status({ connectedAt: new Date(NOW - 5_000).toISOString() }), NOW)).toBeNull();
    expect(whyNoReadings(status(), NOW)).toMatch(/sends nothing.*19200 baud.*send continuously/);
  });

  it('says bytes arrive that never make a line', () => {
    expect(whyNoReadings(status({}, { bytes: 9_000 }), NOW)).toMatch(/never ends a line.*baud rate/);
  });

  it('says the columns do not match, and how to make the sensor name them', () => {
    expect(whyNoReadings(status({}, { bytes: 900, lines: 12, columnMismatches: 12 }), NOW)).toMatch(
      /different number of columns than expected \(11\).*switch the sensor off and on/,
    );
  });

  it('says the checksums fail', () => {
    expect(whyNoReadings(status({}, { bytes: 900, lines: 12, checksumErrors: 12 }), NOW)).toMatch(/fail their checksum/);
  });

  it('adds nothing while readings arrive, or while it is not connected', () => {
    expect(whyNoReadings(status({ readingsLastMinute: 58 }, { bytes: 900, lines: 12 }), NOW)).toBeNull();
    expect(whyNoReadings(status({ connected: false }), NOW)).toBeNull();
  });
});

describe('the last line, as a person can read it', () => {
  it('names the framing bytes and escapes the rest', () => {
    expect(printable('\x02Q,090,004.00\x0342')).toBe('<STX>Q,090,004.00<ETX>42');
    expect(printable('a\x00b\xffc')).toBe('a\\x00b\\xFFc');
  });

  it('cuts a long line', () => {
    const out = printable('x'.repeat(500));
    expect(out).toHaveLength(161);
    expect(out.endsWith('…')).toBe(true);
  });
});
