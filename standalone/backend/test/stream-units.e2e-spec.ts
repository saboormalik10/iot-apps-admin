import { LineFramer } from '../src/stream/framing';
import { GmxParser, gillChecksum, DEFAULT_GMX_FIELDS } from '../src/stream/gmx';
import { RainAccumulator } from '../src/stream/rain';
import { MinuteBuffer } from '../src/stream/minute-buffer';
import { readStreamConfig } from '../src/stream/stream.config';
import { toMetRow, sensorsIn } from '../src/stream/to-met-row';
import { applyQc, isStatusOk } from '../src/ingest/qc';

/**
 * The sensor stream's pure parts. No sensor exists yet (22 Sep 2026), so these
 * pin the behaviour Gill's manual describes and the failure cases a TCP stream
 * produces — the integration test then runs them together over a real socket.
 */

/** A GMX551 data line exactly as the unit frames it. */
const frame = (payload: string) => `\x02${payload}\x03${gillChecksum(payload)}\r\n`;
const DATA = 'Q,164,000.08,166,000.08,+024.8,048,1011.7,00012.400,000.000,0000,';

describe('LineFramer — bytes to lines', () => {
  it('joins a reading split across two packets', () => {
    const f = new LineFramer();
    const line = frame(DATA);
    expect(f.push(line.slice(0, 17))).toEqual([]);
    expect(f.push(line.slice(17))).toEqual([line.trimEnd()]);
  });

  it('splits several readings delivered in one packet', () => {
    const f = new LineFramer();
    expect(f.push(frame(DATA) + frame(DATA) + frame(DATA))).toHaveLength(3);
  });

  it('drops the tail of a reading whose start was lost, at the next STX', () => {
    const f = new LineFramer();
    // Connected mid-line: "…,0000,<ETX>1F" arrives with no STX, then a whole reading.
    const lines = f.push('0012.400,000.000,0000,' + frame(DATA));
    expect(lines).toEqual([frame(DATA).trimEnd()]);
    expect(f.stats.fragments).toBe(1);
  });

  it('discards a buffer that never ends instead of growing without limit', () => {
    const f = new LineFramer(256);
    f.push('x'.repeat(300));
    expect(f.pending).toBe('');
    expect(f.stats.overflows).toBe(1);
    // …and recovers for the next real reading.
    expect(f.push(frame(DATA))).toHaveLength(1);
  });

  it('accepts CR, LF or CRLF endings, and skips blank lines', () => {
    const f = new LineFramer();
    expect(f.push('a\rb\nc\r\n\r\n')).toEqual(['a', 'b', 'c']);
  });
});

describe('GmxParser — one line to named values', () => {
  it('maps a data line by the manual’s default order, before any header', () => {
    const p = new GmxParser();
    const r = p.accept(frame(DATA).trimEnd());
    expect(r.kind).toBe('data');
    if (r.kind !== 'data') return;
    expect(r.reading.node).toBe('Q');
    expect(r.reading.status).toBe('0000');
    expect(r.reading.values).toMatchObject({ dir: 164, speed: 0.08, cdir: 166, temp: 24.8, rh: 48, press: 1011.7, precipt: 12.4, precipi: 0 });
  });

  it('rejects a bad checksum', () => {
    const p = new GmxParser();
    const line = frame(DATA).trimEnd().replace(/..$/, '00');
    expect(p.accept(line)).toEqual({ kind: 'rejected', reason: 'CHECKSUM' });
  });

  it('accepts an unframed line by default, and refuses it when checksums are required', () => {
    expect(new GmxParser(DEFAULT_GMX_FIELDS, 'auto').accept(DATA).kind).toBe('data');
    expect(new GmxParser(DEFAULT_GMX_FIELDS, 'require').accept(DATA)).toEqual({ kind: 'rejected', reason: 'UNFRAMED' });
  });

  it('follows the unit’s own header: a different order maps by name, not position', () => {
    const p = new GmxParser();
    expect(p.accept('NODE,SPEED,DIR,RH,TEMP,STATUS,CHECK').kind).toBe('header');
    const r = p.accept(frame('Q,003.50,270,55,+012.0,0000,').trimEnd());
    expect(r.kind === 'data' && r.reading.values).toEqual({ speed: 3.5, dir: 270, rh: 55, temp: 12 });
  });

  it('converts from the units line to the stored units', () => {
    const p = new GmxParser();
    p.accept('NODE,DIR,SPEED,TEMP,PRESS,PRECIPT,STATUS,CHECK');
    expect(p.accept('-,DEG,KTS,F,INHG,IN,-,-').kind).toBe('units');
    const r = p.accept(frame('Q,090,010.00,+050.0,29.92,0.10,0000,').trimEnd());
    if (r.kind !== 'data') throw new Error(r.kind);
    expect(r.reading.values.speed).toBeCloseTo(5.144, 3);
    expect(r.reading.values.temp).toBeCloseTo(10, 3);
    expect(r.reading.values.press).toBeCloseTo(1013.21, 1);
    expect(r.reading.values.precipt).toBeCloseTo(2.54, 3);
  });

  it('refuses a line whose value count does not match the columns', () => {
    const p = new GmxParser();
    expect(p.accept(frame('Q,164,000.08,0000,').trimEnd())).toEqual({ kind: 'rejected', reason: 'COLUMN_COUNT' });
  });

  it('reads a blank value as missing, not zero', () => {
    const p = new GmxParser();
    const r = p.accept(frame('Q,164,000.08,166,000.08,,048,1011.7,00012.400,000.000,0000,').trimEnd());
    expect(r.kind === 'data' && r.reading.values.temp).toBeNull();
  });
});

describe('RainAccumulator — the site’s own rain total', () => {
  it('total mode: the first reading is a baseline, then rises are rain', () => {
    const r = new RainAccumulator('total');
    expect(r.update(812.4)).toBe(0); // months of rain from before we existed
    expect(r.update(812.6)).toBe(0.2);
    expect(r.update(812.6)).toBe(0.2);
    expect(r.update(813.0)).toBe(0.6);
  });

  it('total mode: a reset counts the rain that fell after it', () => {
    const r = new RainAccumulator('total');
    r.update(5.0);
    r.update(5.4); // 0.4
    // Reset to 0, and 0.2 fell since: summing positive rises would lose the 0.2.
    expect(r.update(0.2)).toBe(0.6);
    expect(r.update(0.4)).toBe(0.8);
  });

  it('interval mode: every reading is rain since the last', () => {
    const r = new RainAccumulator('interval');
    r.update(0.2);
    r.update(0);
    expect(r.update(0.4)).toBe(0.6);
  });

  it('ignores missing and negative readings rather than treating them as a reset', () => {
    const r = new RainAccumulator('total');
    r.update(1.0);
    r.update(null);
    r.update(-1);
    expect(r.update(1.2)).toBe(0.2);
  });

  it('continues across a restart — rain while the PC was off is counted', () => {
    const before = new RainAccumulator('total');
    before.update(10);
    before.update(10.4);
    const saved = before.snapshot();
    const after = new RainAccumulator('total', saved);
    // The gauge rose 1.0 mm while we were down.
    expect(after.update(11.4)).toBe(1.4);
  });

  // Found live: saved state held ~817 mm, a restarted source began at 812.4, and
  // the drop was read as a reset — 812.4 mm of "rain" in one minute.
  it('a drop to a LARGE value is another counter, not rain', () => {
    const t0 = Date.UTC(2026, 8, 22, 10, 0, 0);
    const r = new RainAccumulator('total', { totalMm: 4.6, lastRawMm: 817.0, lastAtMs: t0 });
    expect(r.update(812.4, t0 + 60_000)).toBe(4.6);
    expect(r.anomalies).toBe(1);
    // …and it is the new baseline: rises from it are rain again.
    expect(r.update(812.6, t0 + 61_000)).toBe(4.8);
  });

  it('a rise faster than any real rain is another counter, not rain', () => {
    const t0 = Date.UTC(2026, 8, 22, 10, 0, 0);
    const r = new RainAccumulator('total');
    r.update(3.0, t0);
    expect(r.update(250.0, t0 + 1_000)).toBe(0); // 247 mm in a second
    expect(r.anomalies).toBe(1);
    expect(r.update(250.2, t0 + 2_000)).toBe(0.2);
  });

  it('a big rise after a long outage is believed — the gauge kept counting', () => {
    const t0 = Date.UTC(2026, 8, 22, 10, 0, 0);
    const r = new RainAccumulator('total');
    r.update(100, t0);
    // PC off for six hours of heavy rain: 60 mm is well inside 10 mm a minute.
    expect(r.update(160, t0 + 6 * 3_600_000)).toBe(60);
    expect(r.anomalies).toBe(0);
  });

  it('the outage allowance survives a restart through the snapshot', () => {
    const t0 = Date.UTC(2026, 8, 22, 10, 0, 0);
    const before = new RainAccumulator('total');
    before.update(100, t0);
    const after = new RainAccumulator('total', before.snapshot());
    expect(after.update(160, t0 + 6 * 3_600_000)).toBe(60);
  });

  it('interval mode: an impossible amount in one reading is ignored', () => {
    const r = new RainAccumulator('interval');
    r.update(0.2);
    expect(r.update(500)).toBe(0.2);
    expect(r.anomalies).toBe(1);
  });

  it('never drifts from float addition over a long run', () => {
    const r = new RainAccumulator('interval');
    for (let i = 0; i < 10_000; i++) r.update(0.1);
    expect(r.current).toBe(1000);
  });
});

describe('MinuteBuffer — deciding a minute is finished', () => {
  const at = (s: number) => ({ timestampMs: Date.UTC(2026, 8, 22, 10, 0, 0) + s * 1000 });

  it('hands a minute on when the next minute’s first reading arrives', () => {
    const b = new MinuteBuffer();
    for (let s = 0; s < 60; s++) expect(b.add(at(s))).toEqual([]);
    const done = b.add(at(60));
    expect(done).toHaveLength(1);
    expect(done[0]).toHaveLength(60);
  });

  it('hands it on after the grace period when the link goes quiet', () => {
    const b = new MinuteBuffer(5_000);
    b.add(at(10));
    expect(b.due(at(64).timestampMs)).toEqual([]);
    expect(b.due(at(65).timestampMs)).toHaveLength(1);
  });

  it('drops, and counts, a reading for a minute already written', () => {
    const b = new MinuteBuffer();
    b.add(at(10));
    b.add(at(70)); // writes minute 0
    expect(b.add(at(20))).toEqual([]);
    expect(b.late).toBe(1);
  });

  it('drains a part-minute on shutdown', () => {
    const b = new MinuteBuffer();
    b.add(at(1));
    b.add(at(2));
    expect(b.drain()).toEqual([[at(1), at(2)]]);
    expect(b.size).toBe(0);
  });
});

describe('stream settings', () => {
  it('defaults to port 4000, all interfaces, running-total rain', () => {
    const c = readStreamConfig({ NODE_ENV: 'production' });
    expect(c).toMatchObject({ enabled: true, port: 4000, host: '0.0.0.0', rainMode: 'total', checksum: 'auto' });
    expect(c.fields).toEqual([...DEFAULT_GMX_FIELDS]);
  });

  it('reads the port and field order from the config file', () => {
    const c = readStreamConfig({ STREAM_TCP_PORT: '4100', STREAM_FIELDS: 'node, speed ,dir', STREAM_RAIN_MODE: 'Interval' });
    expect(c.port).toBe(4100);
    expect(c.fields).toEqual(['NODE', 'SPEED', 'DIR']);
    expect(c.rainMode).toBe('interval');
  });

  it('falls back, with a warning, on a bad value instead of refusing to start', () => {
    const c = readStreamConfig({ STREAM_TCP_PORT: '40000000', STREAM_RAIN_MODE: 'buckets' });
    expect(c.port).toBe(4000);
    expect(c.rainMode).toBe('total');
    expect(c.warnings).toHaveLength(2);
  });

  it('listens by default, and dials the converter in connect mode', () => {
    expect(readStreamConfig({}).mode).toBe('listen');
    const c = readStreamConfig({ STREAM_MODE: 'connect', STREAM_REMOTE_HOST: '192.168.1.50', STREAM_REMOTE_PORT: '4001' });
    expect(c).toMatchObject({ mode: 'connect', remoteHost: '192.168.1.50', remotePort: 4001 });
  });

  it('listens instead, with a warning, when connect mode has no converter address', () => {
    const c = readStreamConfig({ STREAM_MODE: 'connect' });
    expect(c.mode).toBe('listen');
    expect(c.warnings[0]).toMatch(/STREAM_REMOTE_HOST/);
  });

  it('is off under test unless switched on', () => {
    expect(readStreamConfig({ NODE_ENV: 'test' }).enabled).toBe(false);
    expect(readStreamConfig({ NODE_ENV: 'test', STREAM_ENABLED: 'true' }).enabled).toBe(true);
  });
});

describe('toMetRow — a reading in the pipeline’s shape', () => {
  const reading = { node: 'Q', status: '0000', raw: DATA, values: { dir: 164, cdir: 166, speed: 2, temp: 20, rh: 50, press: 1010 } };

  it('uses the compass-corrected direction unless told not to', () => {
    expect(toMetRow(reading, 0, null).windDirRelDeg).toBe(166);
    expect(toMetRow(reading, 0, null, false).windDirRelDeg).toBe(164);
  });

  it('derives dew point when the unit does not send one', () => {
    expect(toMetRow(reading, 0, null).dewPointC).toBeCloseTo(9.26, 1);
  });

  it('carries the site rain total, not the gauge counter', () => {
    expect(toMetRow({ ...reading, values: { ...reading.values, precipt: 812 } }, 0, 1.2).precipMm).toBe(1.2);
  });

  it('reports only the sensors actually present', () => {
    const rows = [toMetRow(reading, 0, null)];
    expect(sensorsIn(rows)).toEqual(['wind_speed', 'wind_dir', 'temperature', 'humidity', 'pressure', 'dew_point']);
  });
});

describe('QC — the GMX551 status word', () => {
  it('reads any all-zero status as healthy', () => {
    for (const s of ['0', '00', '0000', 'A', 'ok']) expect(isStatusOk(s)).toBe(true);
    for (const s of ['0100', '1', 'V']) expect(isStatusOk(s)).toBe(false);
  });

  it('keeps the wind of a GMX551 reading whose status is 0000', () => {
    const row = toMetRow({ node: 'Q', status: '0000', raw: DATA, values: { dir: 90, speed: 4 } }, Date.now(), null);
    const out = applyQc([row]);
    expect(out.rows[0].windSpeedMs).toBe(4);
    expect(out.flaggedRows).toBe(0);
  });
});
