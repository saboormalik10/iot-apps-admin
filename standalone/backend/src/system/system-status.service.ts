import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import fs from 'node:fs';
import path from 'node:path';

import { dataDir } from '../config/data-dir';
import { MetMeasure } from '../models/MetMeasure';
import { Organization } from '../models/Organization';
import { StreamService } from '../stream/stream.service';

/** Warn below this much free space on the data drive (the data is never deleted). */
const LOW_DISK_BYTES = 5 * 1024 ** 3;
/** The nightly backup is late after this long. */
const BACKUP_STALE_MS = 36 * 3_600_000;
/** The sensor has been quiet too long after this. */
const SENSOR_QUIET_MS = 5 * 60_000;

export interface BackupResult {
  at: string;
  ok: boolean;
  path: string;
  bytes: number;
  error: string;
}

export interface SystemWarning {
  code: 'SENSOR_QUIET' | 'SENSOR_NEVER' | 'STREAM_ERROR' | 'DISK_LOW' | 'BACKUP_FAILED' | 'BACKUP_STALE' | 'BACKUP_NONE' | 'CLOCK_BEHIND' | 'DB_DOWN';
  message: string;
}

/**
 * Why a CONNECTED sensor gives no readings, from what actually arrived — the
 * question a technician cannot answer from "Connected, 0 readings" (client, 9 Oct
 * 2026). Null when it is not connected (that has its own message) or when there
 * is nothing useful to add yet.
 */
export function whyNoReadings(stream: ReturnType<StreamService['getStatus']>, nowMs: number): string | null {
  if (!stream.connected) return null;
  const c = stream.counts;
  const since = stream.connectedAt ? nowMs - Date.parse(stream.connectedAt) : 0;
  const recentReadings = stream.readingsLastMinute > 0;
  if (recentReadings) return null;
  if (c.bytes === 0)
    return since < 20_000
      ? null
      : 'The converter is connected but sends nothing. Check its serial settings (the GMX551 default is 19200 baud, 8 data bits, no parity, 1 stop bit), the RS-422 wiring, and that the sensor is set to send continuously.';
  if (c.lines === 0)
    return 'Data arrives but never ends a line - usually the converter\'s baud rate or serial settings do not match the sensor\'s.';
  if (c.columnMismatches > 0 && c.columnMismatches >= c.checksumErrors)
    return `Lines arrive, but with a different number of columns than expected (${stream.fields.filter((f) => f !== 'CHECK').length}). The sensor names its columns only when it powers up: switch the sensor off and on while this PC is connected, so it sends them.`;
  if (c.checksumErrors > 0) return 'Lines arrive, but fail their checksum - check the converter\'s serial settings and the wiring.';
  if (c.unframed > 0) return 'Lines arrive without the <STX>...<ETX> framing the GMX551 normally uses - check the sensor\'s output format.';
  return null;
}

/**
 * The site PC's health, for the portal's System page and status.cmd: is the
 * sensor talking, is the disk filling, did last night's backup work, is the
 * clock plausible. Everything a technician would otherwise log in to find out.
 */
@Injectable()
export class SystemStatusService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly stream: StreamService,
  ) {}

  /** The release's VERSION file (installed: two folders up; development: beside backend/). */
  version(): string {
    for (const p of [path.resolve(process.cwd(), '../../VERSION'), path.resolve(process.cwd(), '../VERSION')]) {
      try {
        return fs.readFileSync(p, 'utf8').trim();
      } catch {
        // next
      }
    }
    return 'development';
  }

  /** The line status.cmd prints — no sign-in needed, and the API answers on this PC only. */
  streamSummary() {
    const s = this.stream.getStatus();
    return {
      enabled: s.enabled,
      mode: s.mode,
      port: s.port,
      remote: s.remote,
      connected: s.connected,
      readingsLastMinute: s.readingsLastMinute,
      lastReadingAt: s.lastReadingAt,
    };
  }

  lastBackup(): BackupResult | null {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir(), 'logs', 'backup-last.json'), 'utf8')) as BackupResult;
    } catch {
      return null;
    }
  }

  async disk(): Promise<{ path: string; freeBytes: number; totalBytes: number } | null> {
    try {
      const dir = dataDir();
      const st = await fs.promises.statfs(fs.existsSync(dir) ? dir : process.cwd());
      return { path: dir, freeBytes: st.bavail * st.bsize, totalBytes: st.blocks * st.bsize };
    } catch {
      return null;
    }
  }

  /** The newest stored minute — by the (organisation, time) index, never a scan of years of rows. */
  private async latestMinuteMs(): Promise<number | null> {
    const org = await Organization.findOne({ deletedAt: null }).sort({ createdAt: 1 }).select('_id').lean();
    if (!org) return null;
    const m = await MetMeasure.findOne({ organizationId: org._id }, { timestampMs: 1 }).sort({ timestampMs: -1 }).lean();
    return (m?.timestampMs as number | undefined) ?? null;
  }

  async status(nowMs = Date.now()) {
    const dbUp = this.connection.readyState === 1;
    const stream = this.stream.getStatus();
    const [disk, db, latest] = await Promise.all([
      this.disk(),
      dbUp ? this.connection.db!.stats().catch(() => null) : Promise.resolve(null),
      dbUp ? this.latestMinuteMs().catch(() => null) : Promise.resolve(null),
    ]);
    const backup = this.lastBackup();
    const latestMinuteAt = latest ? new Date(latest).toISOString() : null;

    const warnings: SystemWarning[] = [];
    if (!dbUp) warnings.push({ code: 'DB_DOWN', message: 'The database is not connected.' });
    if (stream.enabled) {
      if (stream.error) warnings.push({ code: 'STREAM_ERROR', message: `The sensor stream cannot run: ${stream.error}` });
      const last = stream.lastReadingAt ? Date.parse(stream.lastReadingAt) : null;
      const why = whyNoReadings(stream, nowMs);
      if (last === null)
        warnings.push({ code: 'SENSOR_NEVER', message: `No reading from the sensor since the service started.${why ? ` ${why}` : ''}` });
      else if (nowMs - last > SENSOR_QUIET_MS)
        warnings.push({ code: 'SENSOR_QUIET', message: `No reading from the sensor for ${Math.round((nowMs - last) / 60_000)} minutes.${why ? ` ${why}` : ''}` });
    }
    if (disk && disk.freeBytes < LOW_DISK_BYTES)
      warnings.push({ code: 'DISK_LOW', message: `Only ${(disk.freeBytes / 1024 ** 3).toFixed(1)} GB free on the data drive. Readings are never deleted, so the disk is the limit.` });
    if (!backup) warnings.push({ code: 'BACKUP_NONE', message: 'No backup has been taken yet.' });
    else if (!backup.ok) warnings.push({ code: 'BACKUP_FAILED', message: `The last backup failed: ${backup.error}` });
    else if (nowMs - Date.parse(backup.at) > BACKUP_STALE_MS)
      warnings.push({ code: 'BACKUP_STALE', message: `The last backup was ${Math.round((nowMs - Date.parse(backup.at)) / 3_600_000)} hours ago.` });
    // The PC clock is the only timestamp source. Data stamped AFTER "now" means
    // the clock has gone back since it was written.
    if (latestMinuteAt && Date.parse(latestMinuteAt) - nowMs > 2 * 60_000)
      warnings.push({ code: 'CLOCK_BEHIND', message: 'Stored readings are newer than this PC\'s clock: the clock has gone back. Check Windows time synchronisation.' });

    return {
      version: this.version(),
      now: new Date(nowMs).toISOString(),
      pcTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      uptimeSec: Math.floor(process.uptime()),
      node: process.version,
      db: {
        connected: dbUp,
        dataBytes: db ? Number(db.dataSize) : null,
        storageBytes: db ? Number(db.storageSize) + Number(db.indexSize ?? 0) : null,
        latestMinuteAt,
      },
      stream: {
        enabled: stream.enabled,
        mode: stream.mode,
        port: stream.port,
        remote: stream.remote,
        listening: stream.listening,
        connected: stream.connected,
        remoteAddress: stream.remoteAddress,
        connectedAt: stream.connectedAt,
        lastReadingAt: stream.lastReadingAt,
        readingsLastMinute: stream.readingsLastMinute,
        minutesWritten: stream.minutesWritten,
        lastMinuteWrittenAt: stream.lastMinuteWrittenAt,
        checksumErrors: stream.counts.checksumErrors,
        rainAnomalies: stream.counts.rainAnomalies,
        error: stream.error,
        connection: stream.connection,
        // What actually arrives — to tell "nothing comes" from "something comes
        // that is not understood" (client, 9 Oct 2026: connected, no data).
        bytesReceived: stream.counts.bytes,
        linesReceived: stream.counts.lines,
        lastByteAt: stream.lastByteAt,
        columnMismatches: stream.counts.columnMismatches,
        unframed: stream.counts.unframed,
        overflows: stream.counts.overflows,
        headers: stream.counts.headers,
        fields: stream.fields,
        lastLine: stream.lastLine,
        lastRejected: stream.lastRejected,
        format: stream.format,
      },
      disk,
      backup,
      warnings,
    };
  }
}
