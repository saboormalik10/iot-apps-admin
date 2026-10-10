import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as net from 'net';
import { Types } from 'mongoose';

import { AuditLog } from '../models/AuditLog';
import { Device, type SensorConnectionSetting } from '../models/Device';
import type { ParsedMetRow } from '../ingest/met-row';
import { IngestService } from '../ingest/ingest.service';
import { isStatusOk, withinGrossRange } from '../ingest/qc';
import { DomainEvent, type MetLiveEvent } from '../realtime/realtime.events';
import { LineFramer } from './framing';
import { GmxParser, type GmxRejectReason } from './gmx';
import { isNmeaSentence, NmeaAssembler, type NmeaReading } from './nmea';
import { MinuteBuffer } from './minute-buffer';
import { RainAccumulator } from './rain';
import { readStreamConfig, type StreamConfig } from './stream.config';
import { directionReference, sensorsIn, toMetRow } from './to-met-row';
import { lastStoredRainTotal } from '../query/rain-totals';

/**
 * The sensor stream: the GMX551's readings, over TCP, into the database.
 *
 *   converter ──TCP──▶ LineFramer ─▶ GmxParser ─▶ RainAccumulator + toMetRow
 *                                                        │
 *                             IngestService ◀── MinuteBuffer (one minute at a time)
 *
 * WE LISTEN; THE CONVERTER CONNECTS IN (client, 10 Sep) — or, with
 * `STREAM_MODE=connect`, we dial the converter and redial when the link drops.
 * Which of the two, and the converter's address, can also be changed in the
 * portal (`setConnection`): saved on the station, it wins over the settings file
 * and takes effect at once, with no restart.
 * One connection at a time — there is one sensor. A new connection REPLACES the
 * old one rather than being refused: when a converter loses power it cannot
 * close its socket, so the old one lingers half-open, and refusing the reconnect
 * would lock the sensor out until that dead socket timed out.
 *
 * EVERY READING GOES TO THE WIND DIAL (`met:live`), as it arrives; only the
 * minute is stored. The client: every display updates once a minute *"except
 * for the wind dial that should have real time update"* (21 Sep).
 *
 * NOTHING HERE STOPS THE PORTAL. A port already in use, a bad setting or a
 * database error is logged and shown on the status page; the web portal and the
 * data already stored carry on regardless.
 *
 * Writes are serialised through one promise chain, so two minutes can never be
 * written at once and their 2- and 10-minute means always see each other.
 */

export interface StreamStatus {
  enabled: boolean;
  mode: StreamConfig['mode'];
  /** The converter's address, in `connect` mode. */
  remote: string | null;
  listening: boolean;
  port: number | null;
  host: string;
  /** Why the listener is not running, when it is not. */
  error: string | null;
  connected: boolean;
  remoteAddress: string | null;
  connectedAt: string | null;
  lastLineAt: string | null;
  /** When any byte last arrived — data that never forms a line still counts. */
  lastByteAt: string | null;
  /**
   * The last line received, whatever it was, made printable (`<STX>`, `<ETX>`,
   * `\xNN`) and cut to 160 characters. "Connected but no readings" (client, 9 Oct
   * 2026) could not be told apart from "readings in a layout we do not expect"
   * without seeing what actually arrives.
   */
  lastLine: string | null;
  /** The last line refused, why, and when. */
  lastRejected: { reason: GmxRejectReason; line: string; at: string } | null;
  /** What the sensor speaks, from the last line understood: Gill ASCII or NMEA 0183. */
  format: 'gill-ascii' | 'nmea' | null;
  lastReadingAt: string | null;
  /** Readings received in the last 60 seconds — about 60 when healthy. */
  readingsLastMinute: number;
  counts: {
    connections: number;
    /** Bytes received over every connection. */
    bytes: number;
    lines: number;
    readings: number;
    headers: number;
    checksumErrors: number;
    columnMismatches: number;
    unframed: number;
    overflows: number;
    fragments: number;
    lateReadings: number;
    /** Rain readings rejected as implausible — a swapped or restarted counter. */
    rainAnomalies: number;
  };
  minutesWritten: number;
  lastMinuteWrittenAt: string | null;
  lastWriteError: string | null;
  fields: readonly string[];
  rainMode: StreamConfig['rainMode'];
  checksum: StreamConfig['checksum'];
  configWarnings: string[];
  stationId: string | null;
  /** The connection settings in use, and where they came from. */
  connection: StreamConnection;
}

export interface StreamConnection {
  mode: StreamConfig['mode'];
  remoteHost: string | null;
  remotePort: number;
  /** The port this PC listens on in `listen` mode. Set by the installer, which opens it in the firewall. */
  listenPort: number;
  /** `file`: the settings file the installer wrote. `portal`: changed in the portal since. */
  source: 'file' | 'portal';
  changedAt: string | null;
  changedBy: string | null;
}

export interface ConnectionInput {
  mode: StreamConfig['mode'];
  remoteHost?: string | null;
  remotePort?: number | null;
}

/** The converter's address as typed: an IP address, or a host name the PC can look up. */
export function isConverterHost(host: string): boolean {
  return net.isIP(host) !== 0 || /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/.test(host);
}

interface Station {
  organizationId: string;
  deviceId: string;
  /** Surveyed mast offset, re-read each minute so an edit reaches the live dial. */
  headingOffsetDeg: number;
  /** What the direction is measured from, as last saved on the station. */
  windDirReference: 'magnetic' | 'mast' | null;
}

@Injectable()
export class StreamService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(StreamService.name);
  private readonly config: StreamConfig = readStreamConfig();

  private server: net.Server | null = null;
  private socket: net.Socket | null = null;
  private framer = new LineFramer(this.config.maxLineBytes);
  private readonly parser = new GmxParser(this.config.fields, this.config.checksum);
  private readonly nmea = new NmeaAssembler();
  private readonly recentLines: { at: string; line: string; outcome: string }[] = [];
  private readonly buffer = new MinuteBuffer<ParsedMetRow>(this.config.flushGraceMs);
  private rain = new RainAccumulator(this.config.rainMode);
  /** What the latest reading's direction was measured from (compass or mast). */
  private dirReference: 'magnetic' | 'mast' | null = null;
  private station: Station | null = null;
  private timer: NodeJS.Timeout | null = null;
  private writes: Promise<void> = Promise.resolve();
  private recentReadings: number[] = [];
  private redialTimer: NodeJS.Timeout | null = null;
  private redialDelayMs = this.config.redialMs;
  private stopping = false;
  /**
   * Bumped whenever the link is torn down to be set up differently. A listener or
   * a dial attempt from before only acts while its generation is current, so a
   * late "connection refused" from the old converter cannot schedule a redial to
   * it, or report its error over the new one's.
   */
  private generation = 0;
  /** Set when the connection was changed in the portal; null = the settings file. */
  private changed: { at: string; by: string } | null = null;

  private readonly status: Omit<StreamStatus, 'connection'> = {
    enabled: this.config.enabled,
    mode: this.config.mode,
    remote: this.config.mode === 'connect' ? `${this.config.remoteHost}:${this.config.remotePort}` : null,
    listening: false,
    port: null,
    host: this.config.host,
    error: null,
    connected: false,
    remoteAddress: null,
    connectedAt: null,
    lastLineAt: null,
    lastByteAt: null,
    lastLine: null,
    lastRejected: null,
    format: null,
    lastReadingAt: null,
    readingsLastMinute: 0,
    counts: {
      connections: 0,
      bytes: 0,
      lines: 0,
      readings: 0,
      headers: 0,
      checksumErrors: 0,
      columnMismatches: 0,
      unframed: 0,
      overflows: 0,
      fragments: 0,
      lateReadings: 0,
      rainAnomalies: 0,
    },
    minutesWritten: 0,
    lastMinuteWrittenAt: null,
    lastWriteError: null,
    fields: this.parser.fields,
    rainMode: this.config.rainMode,
    checksum: this.config.checksum,
    configWarnings: this.config.warnings,
    stationId: null,
  };

  constructor(
    private readonly ingest: IngestService,
    private readonly events: EventEmitter2,
  ) {}

  /** The clock readings are stamped with. A method so a test can move it. */
  protected now(): number {
    return Date.now();
  }

  async onApplicationBootstrap(): Promise<void> {
    for (const w of this.config.warnings) this.logger.warn(`config: ${w}`);
    if (!this.config.enabled) {
      this.logger.log('sensor stream disabled (STREAM_ENABLED)');
      return;
    }
    const station = await this.loadStation();
    if (station) await this.useSavedConnection(station.deviceId);
    await this.startLink();
    this.timer = setInterval(() => this.flush(this.buffer.due(this.now())), 1_000);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.stopLink();
    // A part-minute is data: write it rather than lose it. Its sample count
    // records that it is short.
    await this.flushNow();
  }

  getStatus(): StreamStatus {
    const cutoff = this.now() - 60_000;
    this.recentReadings = this.recentReadings.filter((t) => t > cutoff);
    return {
      ...this.status,
      readingsLastMinute: this.recentReadings.length,
      counts: {
        ...this.status.counts,
        overflows: this.status.counts.overflows + this.framer.stats.overflows,
        fragments: this.status.counts.fragments + this.framer.stats.fragments,
        lateReadings: this.buffer.late,
        rainAnomalies: this.rain.anomalies,
      },
      fields: this.parser.fields,
      connection: this.connection(),
    };
  }

  connection(): StreamConnection {
    return {
      mode: this.config.mode,
      remoteHost: this.config.remoteHost,
      remotePort: this.config.remotePort,
      listenPort: this.status.port ?? this.config.port,
      source: this.changed ? 'portal' : 'file',
      changedAt: this.changed?.at ?? null,
      changedBy: this.changed?.by ?? null,
    };
  }

  /**
   * Change how this PC reaches the converter, from the portal: saved on the
   * station (so it survives a restart and wins over the settings file), audited,
   * and applied at once — the old link is closed and the new one opened. A
   * converter that is off or unreachable is not an error here: the status then
   * says why, and the reader keeps trying, exactly as at startup.
   */
  async setConnection(input: ConnectionInput, actor: { userId: string; email: string; ipAddress?: string | null }): Promise<StreamStatus> {
    const mode = input.mode;
    const remoteHost = input.remoteHost?.trim() || null;
    const remotePort = input.remotePort ?? this.config.remotePort;
    if (mode === 'connect' && !remoteHost) throw badRequest("Enter the converter's address.");
    if (remoteHost && !isConverterHost(remoteHost)) throw badRequest(`"${remoteHost}" is not an IP address or a host name.`);
    if (!Number.isInteger(remotePort) || remotePort < 1 || remotePort > 65_535) throw badRequest('The port must be a whole number from 1 to 65535.');

    const station = this.station ?? (await this.loadStation());
    if (!station) throw Object.assign(new Error('There is no weather station yet. Run the installer first.'), { statusCode: 409, code: 'CONFLICT' });

    const before = { mode: this.config.mode, remoteHost: this.config.remoteHost, remotePort: this.config.remotePort };
    // An address only matters when this PC dials; in listen mode it is kept, so
    // switching back does not mean typing it again.
    const after = { mode, remoteHost: remoteHost ?? this.config.remoteHost, remotePort };
    const saved: SensorConnectionSetting = { ...after, changedAt: new Date(this.now()), changedBy: actor.email };
    await Device.updateOne({ _id: new Types.ObjectId(station.deviceId) }, { $set: { sensorConnection: saved } });
    AuditLog.create({
      organizationId: new Types.ObjectId(station.organizationId),
      userId: new Types.ObjectId(actor.userId),
      userEmail: actor.email,
      ipAddress: actor.ipAddress ?? null,
      action: 'update',
      resourceType: 'device',
      resourceId: station.deviceId,
      resourceName: 'Sensor connection',
      changes: { before, after },
    }).catch(() => void 0);

    this.logger.log(
      `sensor connection changed by ${actor.email}: ${mode === 'connect' ? `dial ${after.remoteHost}:${remotePort}` : `listen on port ${this.config.port}`}`,
    );
    await this.stopLink();
    Object.assign(this.config, after);
    this.changed = { at: saved.changedAt.toISOString(), by: saved.changedBy };
    if (this.config.enabled) await this.startLink();
    return this.getStatus();
  }

  /** At startup: the connection last saved in the portal, if any, over the settings file's. */
  private async useSavedConnection(deviceId: string): Promise<void> {
    const device = await Device.findById(deviceId).select('sensorConnection').lean();
    const saved = device?.sensorConnection;
    if (!saved) return;
    if (saved.mode === 'connect' && !saved.remoteHost) return;
    Object.assign(this.config, { mode: saved.mode, remoteHost: saved.remoteHost, remotePort: saved.remotePort });
    this.changed = { at: new Date(saved.changedAt).toISOString(), by: saved.changedBy };
    this.logger.log(
      `sensor connection from the portal (changed by ${saved.changedBy}) overrides the settings file: ` +
        (saved.mode === 'connect' ? `dial ${saved.remoteHost}:${saved.remotePort}` : 'listen'),
    );
  }

  private async startLink(): Promise<void> {
    this.status.mode = this.config.mode;
    this.status.remote = this.config.mode === 'connect' ? `${this.config.remoteHost}:${this.config.remotePort}` : null;
    this.status.error = null;
    this.redialDelayMs = this.config.redialMs;
    if (this.config.mode === 'connect') this.dial();
    else await this.listen();
  }

  /** Close the listener, the connection and any pending redial. The minute buffer is kept. */
  private async stopLink(): Promise<void> {
    this.generation += 1;
    if (this.redialTimer) clearTimeout(this.redialTimer);
    this.redialTimer = null;
    const socket = this.socket;
    this.socket = null;
    socket?.destroy();
    this.status.connected = false;
    this.status.remoteAddress = null;
    const server = this.server;
    this.server = null;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    this.status.listening = false;
    this.status.port = null;
  }

  /** The bound port — for tests, which listen on port 0. */
  get port(): number | null {
    return this.status.port;
  }

  /** Write everything buffered now, and wait for it. */
  async flushNow(): Promise<void> {
    this.flush(this.buffer.drain());
    await this.writes;
  }

  // ── Listening ─────────────────────────────────────────────────────────────

  private listen(): Promise<void> {
    const gen = this.generation;
    return new Promise((resolve) => {
      const server = net.createServer((socket) => {
        if (gen !== this.generation) socket.destroy();
        else this.accept(socket);
      });
      server.on('error', (err: NodeJS.ErrnoException) => {
        if (gen !== this.generation) return resolve();
        // EADDRINUSE on a PC means another program — or a second copy of this
        // service — has the port. Said plainly, because it is the likeliest
        // install problem and the log is where a technician will look.
        const why =
          err.code === 'EADDRINUSE'
            ? `port ${this.config.port} is already in use by another program`
            : err.message;
        this.status.error = why;
        this.status.listening = false;
        this.logger.error(`sensor stream not listening: ${why}`);
        resolve();
      });
      server.listen(this.config.port, this.config.host, () => {
        if (gen !== this.generation) return resolve();
        const addr = server.address();
        this.status.port = typeof addr === 'object' && addr ? addr.port : this.config.port;
        this.status.listening = true;
        this.status.error = null;
        this.logger.log(`sensor stream listening on ${this.config.host}:${this.status.port}`);
        resolve();
      });
      this.server = server;
    });
  }

  /**
   * Dial the converter (`STREAM_MODE=connect`), and keep dialling.
   *
   * A converter that is off, rebooting or unplugged refuses or never answers;
   * either way this waits and tries again, doubling the wait to a 30-second
   * ceiling so a long outage does not become a connection attempt every two
   * seconds for hours. A successful connection resets the wait.
   */
  private dial(): void {
    if (this.stopping) return;
    const gen = this.generation;
    const { remoteHost, remotePort } = this.config;
    const socket = net.connect({ host: remoteHost!, port: remotePort });
    let opened = false;
    socket.once('connect', () => {
      if (gen !== this.generation) {
        socket.destroy();
        return;
      }
      opened = true;
      this.redialDelayMs = this.config.redialMs;
      this.status.error = null;
      this.accept(socket);
    });
    socket.once('error', (err) => {
      if (gen !== this.generation) return;
      if (!opened) {
        this.status.error = `cannot reach the converter at ${remoteHost}:${remotePort} — ${err.message}`;
      }
    });
    socket.once('close', () => {
      if (gen !== this.generation) return;
      if (!opened) this.logger.warn(this.status.error ?? `cannot reach ${remoteHost}:${remotePort}`);
      this.scheduleRedial();
    });
  }

  private scheduleRedial(): void {
    if (this.stopping || this.redialTimer) return;
    const wait = this.redialDelayMs;
    this.redialDelayMs = Math.min(this.redialDelayMs * 2, 30_000);
    this.redialTimer = setTimeout(() => {
      this.redialTimer = null;
      this.dial();
    }, wait);
    this.redialTimer.unref();
  }

  private accept(socket: net.Socket): void {
    const remote = `${socket.remoteAddress ?? '?'}:${socket.remotePort ?? '?'}`;
    if (this.socket) {
      this.logger.warn(`new connection from ${remote} replaces ${this.status.remoteAddress}`);
      this.socket.destroy();
    }
    this.socket = socket;
    // A fresh framer: the previous connection's half line is not this one's.
    this.status.counts.overflows += this.framer.stats.overflows;
    this.status.counts.fragments += this.framer.stats.fragments;
    this.framer = new LineFramer(this.config.maxLineBytes);
    this.status.counts.connections += 1;
    this.status.connected = true;
    this.status.remoteAddress = remote;
    this.status.connectedAt = new Date(this.now()).toISOString();
    this.logger.log(`sensor connected from ${remote}`);

    socket.setKeepAlive(true, 30_000);
    // Silence this long means the link is dead even if TCP has not noticed;
    // closing it lets the converter reconnect.
    socket.setTimeout(this.config.idleTimeoutMs, () => {
      this.logger.warn(`no data from ${remote} for ${Math.round(this.config.idleTimeoutMs / 1000)} s — closing`);
      socket.destroy();
    });
    socket.on('data', (chunk) => this.onData(chunk));
    socket.on('error', (err) => this.logger.warn(`connection ${remote}: ${err.message}`));
    socket.on('close', () => {
      if (this.socket === socket) {
        this.socket = null;
        this.status.connected = false;
        this.logger.log(`sensor disconnected (${remote})`);
      }
    });
  }

  // ── Readings ──────────────────────────────────────────────────────────────

  private onData(chunk: Buffer): void {
    const at = this.now();
    this.status.counts.bytes += chunk.length;
    this.status.lastByteAt = new Date(at).toISOString();
    for (const line of this.framer.push(chunk)) {
      this.status.counts.lines += 1;
      this.status.lastLineAt = new Date(at).toISOString();
      this.status.lastLine = printable(line);
      // NMEA sentences and Gill ASCII lines are told apart line by line, so a
      // unit switched between the two needs no setting changed here.
      if (isNmeaSentence(line)) {
        this.status.format = 'nmea';
        const result = this.nmea.accept(line, at);
        if (result.kind === 'rejected') this.reject(line, result.reason, at);
        else this.remember(line, at, result.kind === 'data' ? 'reading' : 'part of a reading');
        if (result.kind === 'data') this.onReading(result.reading, result.atMs);
        continue;
      }
      const result = this.parser.accept(line);
      switch (result.kind) {
        case 'header':
          this.status.format = 'gill-ascii';
          this.status.counts.headers += 1;
          this.remember(line, at, 'header');
          this.logger.log(`sensor header: ${result.fields.join(',')}`);
          break;
        case 'units':
          this.remember(line, at, 'units');
          this.logger.log(`sensor units: ${result.units.join(',')}`);
          break;
        case 'rejected':
          this.reject(line, result.reason, at);
          break;
        case 'data':
          this.status.format = 'gill-ascii';
          this.remember(line, at, 'reading');
          this.onReading(result.reading, at);
          break;
      }
    }
  }

  private reject(line: string, reason: GmxRejectReason, at: number): void {
    this.status.lastRejected = { reason, line: printable(line), at: new Date(at).toISOString() };
    if (reason === 'CHECKSUM') this.status.counts.checksumErrors += 1;
    else if (reason === 'UNFRAMED') this.status.counts.unframed += 1;
    else this.status.counts.columnMismatches += 1;
    this.remember(line, at, REJECTED[reason]);
  }

  /** The last lines received and what became of each — what a technician sends us. */
  private remember(line: string, at: number, outcome: string): void {
    this.recentLines.push({ at: new Date(at).toISOString(), line: printable(line, 300), outcome });
    if (this.recentLines.length > RECENT_LINES) this.recentLines.splice(0, this.recentLines.length - RECENT_LINES);
  }

  getRecentLines(): ReadonlyArray<{ at: string; line: string; outcome: string }> {
    return [...this.recentLines];
  }

  /** One complete reading, from either format, into the live dial and the minute. */
  private onReading(reading: NmeaReading, at: number): void {
    const raw = reading.values.precipt;
    // No rain column at all → no rain figure, rather than a flat zero that would
    // read as "it did not rain". NMEA sends intensity only: its rain arrives as
    // the amount over the cycle.
    const before = this.rain.anomalies;
    const rainTotal =
      raw !== undefined ? this.rain.update(raw, at) : reading.rainIntervalMm !== undefined ? this.rain.addInterval(reading.rainIntervalMm, at) : null;
    if (this.rain.anomalies !== before) this.logger.warn(`rain: ${this.rain.lastAnomaly}`);
    const row = toMetRow(reading, at, rainTotal, this.config.preferCorrectedDirection);
    this.dirReference = directionReference(reading, this.config.preferCorrectedDirection) ?? this.dirReference;
    this.status.counts.readings += 1;
    this.status.lastReadingAt = new Date(at).toISOString();
    this.recentReadings.push(at);
    if (this.recentReadings.length > 600) this.recentReadings.splice(0, this.recentReadings.length - 600);
    this.emitLive(row);
    this.flush(this.buffer.add(row));
  }

  /**
   * One reading to the wind dial, as it arrives.
   *
   * Not QC'd the way a stored minute is — there is no minute yet — but a reading
   * the sensor itself flags, or one outside what the atmosphere can do, is sent as
   * "no reading" rather than swinging the needle to it. The gateway drops it at
   * once when nobody is watching.
   */
  private emitLive(row: ParsedMetRow): void {
    const station = this.station;
    if (!station) return;
    const healthy = row.status === null || isStatusOk(row.status);
    const speed = healthy && row.windSpeedMs !== null && withinGrossRange('windSpeedMs', row.windSpeedMs) ? row.windSpeedMs : null;
    const dir = healthy && row.windDirRelDeg !== null && withinGrossRange('windDirRelDeg', row.windDirRelDeg) ? row.windDirRelDeg : null;
    const event: MetLiveEvent = {
      organizationId: station.organizationId,
      deviceId: station.deviceId,
      sample: {
        deviceId: station.deviceId,
        measuredAtMs: row.timestampMs,
        windSpeedMs: speed,
        windDirTrueDeg: dir === null ? null : (((dir + station.headingOffsetDeg) % 360) + 360) % 360,
      },
    };
    this.events.emit(DomainEvent.MET_LIVE, event);
  }

  // ── Writing ───────────────────────────────────────────────────────────────

  /** Queue completed minutes for writing, one at a time and in order. */
  private flush(minutes: ParsedMetRow[][]): void {
    for (const rows of minutes) {
      if (rows.length === 0) continue;
      const rain = this.rain.snapshot();
      this.writes = this.writes.then(() => this.write(rows, rain));
    }
  }

  private async write(rows: ParsedMetRow[], rain: ReturnType<RainAccumulator['snapshot']>): Promise<void> {
    try {
      const station = this.station ?? (await this.loadStation());
      if (!station) throw new Error('no weather station is set up yet');
      const out = await this.ingest.ingestStreamRows(station.organizationId, station.deviceId, rows, sensorsIn(rows));
      if (!out) {
        // Deleted while streaming: find out again next time.
        this.station = null;
        throw new Error('the weather station no longer exists');
      }
      this.status.minutesWritten += 1;
      this.status.lastMinuteWrittenAt = new Date(this.now()).toISOString();
      this.status.lastWriteError = null;
      // An edited mast offset reaches the live dial within a minute.
      const fresh = await Device.findById(station.deviceId).select('headingOffsetDeg').lean();
      if (fresh) station.headingOffsetDeg = fresh.headingOffsetDeg ?? 0;
      const set: Record<string, unknown> = {};
      if (rows.some((r) => r.precipMm !== null)) set.rainState = rain;
      if (this.dirReference && this.dirReference !== station.windDirReference) {
        set.windDirReference = this.dirReference;
        station.windDirReference = this.dirReference;
      }
      if (Object.keys(set).length) await Device.updateOne({ _id: new Types.ObjectId(station.deviceId) }, { $set: set });
    } catch (err) {
      // Logged and shown, never thrown: the next minute must still be tried.
      this.status.lastWriteError = String((err as Error).message ?? err);
      this.logger.error(`could not write a minute from the sensor stream: ${this.status.lastWriteError}`);
    }
  }

  /** The station the stream writes to, and its saved rain state. */
  private async loadStation(): Promise<Station | null> {
    const filter: Record<string, unknown> = { type: 'MET-LINK', deletedAt: null };
    if (this.config.stationBleId) filter.bleId = this.config.stationBleId;
    const device = await Device.findOne(filter)
      .sort({ createdAt: 1 })
      .select('organizationId rainState headingOffsetDeg windDirReference')
      .lean();
    if (!device) {
      this.logger.warn(
        this.config.stationBleId
          ? `no station with id ${this.config.stationBleId} (STREAM_STATION_BLE_ID)`
          : 'no weather station yet — minutes cannot be written until first-run setup creates it',
      );
      return null;
    }
    this.station = {
      organizationId: String(device.organizationId),
      deviceId: String(device._id),
      headingOffsetDeg: device.headingOffsetDeg ?? 0,
      windDirReference: (device.windDirReference as Station['windDirReference']) ?? null,
    };
    this.status.stationId = this.station.deviceId;
    // Only on the first load: once readings are flowing, the accumulator in
    // memory is ahead of whatever was last saved.
    if (this.status.counts.readings === 0) {
      if (device.rainState) {
        this.rain = new RainAccumulator(this.config.rainMode, device.rainState);
      } else {
        // No saved state but stored minutes — a restored database, say. Carry on
        // from the last stored total rather than from zero: the total must never
        // go down, or every rain figure computed from it goes wrong.
        const last = await lastStoredRainTotal(device._id as Types.ObjectId);
        if (last !== null) this.rain = new RainAccumulator(this.config.rainMode, { totalMm: last, lastRawMm: null });
      }
    }
    return this.station;
  }
}

const RECENT_LINES = 100;

const REJECTED: Record<GmxRejectReason, string> = {
  CHECKSUM: 'refused: checksum does not match',
  UNFRAMED: 'refused: no <STX>…<ETX> framing',
  COLUMN_COUNT: 'refused: wrong number of columns',
};

function badRequest(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400, code: 'VALIDATION_ERROR' });
}

/** A received line as text a person can read: control bytes named, long lines cut. */
export function printable(line: string, max = 160): string {
  const named: Record<string, string> = { '\x02': '<STX>', '\x03': '<ETX>', '\t': '<TAB>' };
  let out = '';
  for (const c of line) {
    const code = c.charCodeAt(0);
    out += named[c] ?? (code < 0x20 || code === 0x7f || code > 0x7e ? `\\x${code.toString(16).padStart(2, '0').toUpperCase()}` : c);
    if (out.length >= max) return `${out.slice(0, max)}…`;
  }
  return out;
}
