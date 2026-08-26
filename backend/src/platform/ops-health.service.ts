import { Injectable } from '@nestjs/common';
import mongoose from 'mongoose';

import { Device } from '../models/Device';
import { StationAccount } from '../models/StationAccount';
import { MetMeasure } from '../models/MetMeasure';
import { MetRecord } from '../models/MetRecord';
import { MetIngestFile } from '../models/MetIngestFile';
import { Organization } from '../models/Organization';

export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface Check {
  key: string;
  status: CheckStatus;
  summary: string;
  /** What an operator should actually DO. A check nobody can act on is noise. */
  action?: string;
  detail?: Record<string, unknown>;
}

/** A station quiet for this long has stopped, not paused. Files arrive every minute. */
const SILENT_MS = 15 * 60 * 1000;
/** TTL is 30 days; MongoDB's TTL monitor runs every 60s but can lag under load. */
const MEASURE_TTL_DAYS = 30;
const TTL_GRACE_DAYS = 2;

/**
 * Operational health across every customer.
 *
 * Deliberately about the SILENT failures, because those are the ones that have
 * actually bitten this system: a full disk looks exactly like a quiet station, a
 * dead station looks like calm weather, and a TTL that stops running just grows.
 * None of them raise an error anywhere.
 *
 * Pull-based on purpose — there is no scheduler in this codebase, so inventing
 * one to send alerts would add a moving part that itself needs monitoring. An
 * external prober hits this and decides; the endpoint's job is to be honest.
 */
@Injectable()
export class OpsHealthService {
  async check(): Promise<{ status: CheckStatus; checks: Check[]; generatedAt: string }> {
    const checks = await Promise.all([
      this.database(),
      this.silentStations(),
      this.ingestErrors(),
      this.retention(),
      this.dayRecordLag(),
      this.pendingProvisioning(),
    ]);

    // Worst wins: one failing check must not be averaged away by five healthy ones.
    const status: CheckStatus = checks.some((c) => c.status === 'fail')
      ? 'fail'
      : checks.some((c) => c.status === 'warn')
        ? 'warn'
        : 'ok';

    return { status, checks, generatedAt: new Date().toISOString() };
  }

  private async database(): Promise<Check> {
    const connected = mongoose.connection.readyState === 1;
    return {
      key: 'database',
      status: connected ? 'ok' : 'fail',
      summary: connected ? 'Connected' : 'Not connected',
      action: connected ? undefined : 'Check the connection string and that the cluster is reachable.',
    };
  }

  /**
   * Stations that were reporting and have stopped.
   *
   * Only ACTIVE mappings count: a revoked or pending station is silent on
   * purpose, and alerting on it would train people to ignore this check.
   */
  private async silentStations(): Promise<Check> {
    const active = await StationAccount.find({ isActive: true }).select('deviceId account folderPath').lean();
    if (active.length === 0) {
      return { key: 'silentStations', status: 'ok', summary: 'No active stations yet' };
    }

    const cutoff = new Date(Date.now() - SILENT_MS);
    const devices = await Device.find({ _id: { $in: active.map((a) => a.deviceId) }, deletedAt: null })
      .select('name lastSeenAt')
      .lean();

    // A station that has NEVER reported is pending, not silent — it belongs to
    // the provisioning check, not this one.
    const everReported = devices.filter((d) => d.lastSeenAt);
    const silent = everReported.filter((d) => new Date(d.lastSeenAt as Date) < cutoff);

    return {
      key: 'silentStations',
      status: silent.length === 0 ? 'ok' : 'warn',
      summary:
        silent.length === 0
          ? `All ${everReported.length} reporting station(s) are current`
          : `${silent.length} of ${everReported.length} station(s) silent for over ${SILENT_MS / 60000} minutes`,
      action: silent.length
        ? 'Check the logger and the SFTP upload folder. A full disk on the ingest box looks exactly like this.'
        : undefined,
      detail: {
        silent: silent.slice(0, 10).map((d) => ({ name: d.name, lastSeenAt: d.lastSeenAt })),
        neverReported: devices.length - everReported.length,
      },
    };
  }

  /** Files the platform could not use. Should be at or near zero. */
  private async ingestErrors(): Promise<Check> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [rejected, total] = await Promise.all([
      MetIngestFile.countDocuments({ receivedAt: { $gte: since }, state: 'rejected' }),
      MetIngestFile.countDocuments({ receivedAt: { $gte: since } }),
    ]);

    const rate = total ? rejected / total : 0;
    return {
      key: 'ingestErrors',
      status: rejected === 0 ? 'ok' : rate > 0.05 ? 'fail' : 'warn',
      summary:
        total === 0
          ? 'No files received in the last 24 hours'
          : `${rejected} of ${total} file(s) rejected in 24h (${(rate * 100).toFixed(1)}%)`,
      action: rejected ? 'Look at the quarantine folder on the ingest box; the reason is recorded per file.' : undefined,
      detail: { rejected, total },
    };
  }

  /**
   * Is the TTL actually deleting?
   *
   * A TTL index that stops working raises nothing — the collection simply grows
   * until the disk fills. The observable is the AGE of the oldest document: it
   * should never exceed the TTL by more than the monitor's lag.
   */
  private async retention(): Promise<Check> {
    const indexes = await mongoose.connection.db!.collection('metmeasures').indexes();
    const ttl = indexes.find((i) => (i as { expireAfterSeconds?: number }).expireAfterSeconds !== undefined);

    if (!ttl) {
      return {
        key: 'retention',
        status: 'fail',
        summary: 'No TTL index on metmeasures — raw readings will grow without bound',
        action: 'Re-run the retention migration. At 50 stations this fills a disk in weeks.',
      };
    }

    const oldest = await MetMeasure.findOne({ source: 'sftp' }).sort({ createdAt: 1 }).select('createdAt').lean();
    if (!oldest?.createdAt) {
      return { key: 'retention', status: 'ok', summary: 'TTL index present; no SFTP data retained yet' };
    }

    const ageDays = (Date.now() - new Date(oldest.createdAt).getTime()) / 86_400_000;
    const overdue = ageDays > MEASURE_TTL_DAYS + TTL_GRACE_DAYS;

    return {
      key: 'retention',
      status: overdue ? 'fail' : 'ok',
      summary: overdue
        ? `Oldest reading is ${ageDays.toFixed(1)} days old — past the ${MEASURE_TTL_DAYS}-day TTL`
        : `Oldest reading is ${ageDays.toFixed(1)} days old (TTL ${MEASURE_TTL_DAYS} days)`,
      action: overdue
        ? 'The TTL monitor is not keeping up or is disabled. Check the cluster; the collection is growing without bound.'
        : undefined,
      detail: { oldestCreatedAt: oldest.createdAt, ttlDays: MEASURE_TTL_DAYS, ageDays: Number(ageDays.toFixed(2)) },
    };
  }

  /**
   * Day records whose end is far behind the readings they hold.
   *
   * Catches the rollup silently failing: measures keep arriving, but the record
   * that the dashboard and the daily summary read stops advancing.
   */
  private async dayRecordLag(): Promise<Check> {
    const recent = await MetRecord.find({ source: 'sftp', deletedAt: null })
      .sort({ dateEndMs: -1 })
      .limit(1)
      .select('dateEndMs deviceName')
      .lean();

    if (!recent[0]?.dateEndMs) {
      return { key: 'dayRecordLag', status: 'ok', summary: 'No SFTP day records yet' };
    }

    const lagMin = (Date.now() - recent[0].dateEndMs) / 60_000;

    // A NEGATIVE lag means a reading is dated in the future — a station clock
    // running ahead. The parser's sanity band tolerates up to 48h, so these are
    // stored; the danger is that `getMetLatest` then pins to a future reading
    // and stays there until real time catches up. Reporting "-193 minutes old"
    // as healthy would hide it.
    if (lagMin < -5) {
      const aheadMin = Math.abs(lagMin);
      return {
        key: 'dayRecordLag',
        status: 'warn',
        summary: `Newest reading is dated ${aheadMin.toFixed(0)} minutes in the FUTURE — a station clock is ahead`,
        action:
          'Check the station RTC. Live readings will appear stuck until real time catches up, because the latest ' +
          'reading is always the one furthest ahead.',
        detail: { minutesAhead: Number(aheadMin.toFixed(1)), device: recent[0].deviceName },
      };
    }

    return {
      key: 'dayRecordLag',
      status: lagMin > 60 ? 'warn' : 'ok',
      summary: `Newest reading in a day record is ${lagMin.toFixed(0)} minutes old`,
      action: lagMin > 60 ? 'Either no data is arriving, or the ingest is failing after the parse step.' : undefined,
      detail: { lagMinutes: Number(lagMin.toFixed(1)), device: recent[0].deviceName },
    };
  }

  /** Provisioning jobs stuck waiting for an agent that may not be running. */
  private async pendingProvisioning(): Promise<Check> {
    const pending = await StationAccount.countDocuments({ isActive: false });
    const customers = await Organization.countDocuments({ deletedAt: null });
    return {
      key: 'pendingProvisioning',
      status: pending === 0 ? 'ok' : 'warn',
      summary: pending === 0 ? 'No stations awaiting provisioning' : `${pending} station(s) waiting for the agent`,
      action: pending ? 'Check that the provisioning agent is running on the SFTP box and polling.' : undefined,
      detail: { pending, customers },
    };
  }
}
