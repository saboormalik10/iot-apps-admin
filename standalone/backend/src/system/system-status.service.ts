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
      if (last === null) warnings.push({ code: 'SENSOR_NEVER', message: 'No reading from the sensor since the service started.' });
      else if (nowMs - last > SENSOR_QUIET_MS)
        warnings.push({ code: 'SENSOR_QUIET', message: `No reading from the sensor for ${Math.round((nowMs - last) / 60_000)} minutes.` });
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
      },
      disk,
      backup,
      warnings,
    };
  }
}
