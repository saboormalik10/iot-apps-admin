import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as net from 'net';
import { Types } from 'mongoose';

import { Device } from '../models/Device';
import type { ParsedMetRow } from '../ingest/met-row';
import { IngestService } from '../ingest/ingest.service';
import { isStatusOk, withinGrossRange } from '../ingest/qc';
import { DomainEvent, type MetLiveEvent } from '../realtime/realtime.events';
import { LineFramer } from './framing';
import { GmxParser } from './gmx';
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
  lastReadingAt: string | null;
  /** Readings received in the last 60 seconds — about 60 when healthy. */
  readingsLastMinute: number;
  counts: {
    connections: number;
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

  private readonly status: StreamStatus = {
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
    lastReadingAt: null,
    readingsLastMinute: 0,
    counts: {
      connections: 0,
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
    await this.loadStation();
    if (this.config.mode === 'connect') this.dial();
    else await this.listen();
    this.timer = setInterval(() => this.flush(this.buffer.due(this.now())), 1_000);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.redialTimer) clearTimeout(this.redialTimer);
    this.redialTimer = null;
    this.socket?.destroy();
    this.socket = null;
    if (this.server) await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = null;
    this.status.listening = false;
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
    };
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
    return new Promise((resolve) => {
      const server = net.createServer((socket) => this.accept(socket));
      server.on('error', (err: NodeJS.ErrnoException) => {
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
    const { remoteHost, remotePort } = this.config;
    const socket = net.connect({ host: remoteHost!, port: remotePort });
    let opened = false;
    socket.once('connect', () => {
      opened = true;
      this.redialDelayMs = this.config.redialMs;
      this.status.error = null;
      this.accept(socket);
    });
    socket.once('error', (err) => {
      if (!opened) {
        this.status.error = `cannot reach the converter at ${remoteHost}:${remotePort} — ${err.message}`;
      }
    });
    socket.once('close', () => {
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
    for (const line of this.framer.push(chunk)) {
      this.status.counts.lines += 1;
      this.status.lastLineAt = new Date(at).toISOString();
      const result = this.parser.accept(line);
      switch (result.kind) {
        case 'header':
          this.status.counts.headers += 1;
          this.logger.log(`sensor header: ${result.fields.join(',')}`);
          break;
        case 'units':
          this.logger.log(`sensor units: ${result.units.join(',')}`);
          break;
        case 'rejected':
          if (result.reason === 'CHECKSUM') this.status.counts.checksumErrors += 1;
          else if (result.reason === 'UNFRAMED') this.status.counts.unframed += 1;
          else this.status.counts.columnMismatches += 1;
          break;
        case 'data': {
          const raw = result.reading.values.precipt;
          // No rain column at all → no rain figure, rather than a flat zero that
          // would read as "it did not rain".
          const before = this.rain.anomalies;
          const rainTotal = raw === undefined ? null : this.rain.update(raw, at);
          if (this.rain.anomalies !== before) this.logger.warn(`rain: ${this.rain.lastAnomaly}`);
          const row = toMetRow(result.reading, at, rainTotal, this.config.preferCorrectedDirection);
          this.dirReference = directionReference(result.reading, this.config.preferCorrectedDirection) ?? this.dirReference;
          this.status.counts.readings += 1;
          this.status.lastReadingAt = new Date(at).toISOString();
          this.recentReadings.push(at);
          if (this.recentReadings.length > 600) this.recentReadings.splice(0, this.recentReadings.length - 600);
          this.emitLive(row);
          this.flush(this.buffer.add(row));
          break;
        }
      }
    }
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
