import { Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { StreamType } from '../models/StreamType';
import { StationAccount } from '../models/StationAccount';
import { getStreamParser, listStreamParsers } from '../ingest/registry';

const badReq = (msg: string, code = 'VALIDATION_ERROR') =>
  Object.assign(new Error(msg), { statusCode: 400, code });

/** Rows shown in a preview. Enough to judge a file, not enough to be a viewer. */
const PREVIEW_ROWS = 10;

/**
 * Stream types for the admin UI.
 *
 * Two things are joined here: the PARSERS (code, in the registry) and the
 * TYPES (operator metadata, in the database). They are separate on purpose, and
 * the join is where the interesting failure lives — a configured type whose
 * parser has been removed would accept stations and then reject every file they
 * send. So it is reported as unavailable rather than left to be discovered.
 */
/** One station's use of a stream type, for the super-admin listing. */
export interface StationUsage {
  stationAccountId: string;
  deviceName: string;
  organizationName: string;
  account: string;
  folderPath: string;
  /** True when the type is the folder's fallback; false when reached by prefix. */
  isDefault: boolean;
  /** False when this station has been switched off for this type. */
  enabled: boolean;
}

@Injectable()
export class StreamTypesService {
  /**
   * Everything an operator needs to choose a stream type, in one call.
   *
   * @param organizationId Scope the station list to one customer. Omitted for a
   *   super admin, who sees every station across the platform — the only role
   *   for which that is ever true.
   */
  async list(organizationId?: string) {
    const stationMatch: Record<string, unknown> = { isActive: true };
    if (organizationId) stationMatch.organizationId = new Types.ObjectId(organizationId);

    const [configured, stations] = await Promise.all([
      StreamType.find({ deletedAt: null }).sort({ name: 1 }).lean(),
      /**
       * A station counts against a stream type if it uses it AT ALL — as the
       * folder's default, or through any of its per-prefix routes.
       *
       * Grouping on `streamType` alone missed the routes entirely: the Sydney
       * station reads wind AND environmental files out of one folder, so it is
       * a real user of both, yet `environmental-csv` reported "0 stations"
       * while it was actively ingesting. That reads as "nothing uses this",
       * which is exactly the cue an operator would act on before disabling it.
       *
       * A station using one type twice (as default and as a route) is counted
       * once for it: `$setUnion` dedupes before the count.
       */
      /**
       * Which stations use each type, and how.
       *
       * A station counts if it uses the type AT ALL — as the folder's default,
       * or through any of its per-prefix routes. Grouping on `streamType` alone
       * missed the routes entirely: the Sydney station reads wind AND
       * environmental files out of one folder, so it is a real user of both, yet
       * `environmental-csv` reported "0 stations" while it was actively
       * ingesting. That reads as "nothing uses this", which is the cue an
       * operator would act on before disabling it.
       *
       * `$setUnion` dedupes first, so a station using one type as BOTH its
       * default and a route is listed once.
       *
       * The names are safe to return here: this whole controller is behind
       * `SuperAdminGuard`, which is also the only role that can reach the page.
       */
      StationAccount.aggregate<{ _id: string; n: number; stations: StationUsage[] }>([
        { $match: stationMatch },
        {
          $lookup: {
            from: 'devices',
            localField: 'deviceId',
            foreignField: '_id',
            as: 'device',
            pipeline: [{ $project: { name: 1 } }],
          },
        },
        {
          $lookup: {
            from: 'organizations',
            localField: 'organizationId',
            foreignField: '_id',
            as: 'org',
            pipeline: [{ $project: { name: 1 } }],
          },
        },
        {
          $project: {
            deviceName: { $ifNull: [{ $first: '$device.name' }, '(unknown station)'] },
            disabledStreamTypes: { $ifNull: ['$disabledStreamTypes', []] },
            organizationName: { $ifNull: [{ $first: '$org.name' }, '' ] },
            folderPath: 1,
            account: 1,
            defaultType: '$streamType',
            types: {
              $setUnion: [['$streamType'], { $ifNull: ['$streamRoutes.streamType', []] }],
            },
          },
        },
        { $unwind: '$types' },
        {
          $group: {
            _id: '$types',
            n: { $sum: 1 },
            stations: {
              $push: {
                stationAccountId: { $toString: '$_id' },
                deviceName: '$deviceName',
                organizationName: '$organizationName',
                account: '$account',
                folderPath: '$folderPath',
                // Whether this type is the folder's fallback or reached by a
                // filename prefix — the difference matters when a folder carries
                // more than one format.
                isDefault: { $eq: ['$defaultType', '$types'] },
                // Whether this station is currently permitted to ingest it.
                enabled: { $not: [{ $in: ['$types', '$disabledStreamTypes'] }] },
              },
            },
          },
        },
      ]),
    ]);

    const usage = new Map(stations.map((s) => [s._id, s]));
    const parsers = new Map(listStreamParsers().map((p) => [p.key, p]));

    return configured.map((t) => {
      const parser = parsers.get(t.parserKey);
      return {
        id: String(t._id),
        key: t.key,
        parserKey: t.parserKey,
        name: t.name,
        description: t.description || parser?.description || '',
        isBuiltIn: t.isBuiltIn,
        /** False when no parser answers to `parserKey` — the interesting case. */
        parserAvailable: Boolean(parser),
        stationCount: usage.get(t.key)?.n ?? 0,
        /** Who uses it. Super-admin only — see the note on the aggregate above. */
        stations: (usage.get(t.key)?.stations ?? [])
          .slice()
          .sort((a, b) => a.deviceName.localeCompare(b.deviceName)),
        // Published so an operator can see which header cells are understood
        // BEFORE pointing a station at this type.
        columns: (parser?.columns ?? [])
          .filter((c) => !c.field.startsWith('__'))
          .map((c) => ({ field: c.field, aliases: c.aliases, numeric: c.numeric, fixedUnit: c.fixedUnit ?? null })),
        filenameHint: parser?.filenameHint ? String(parser.filenameHint) : null,
      };
    });
  }

  /**
   * Parse a sample file and report what WOULD be stored. Writes nothing.
   *
   * This exists because the alternative way to find out whether a file is
   * understood is to point a station at it and read the quarantine folder. An
   * operator onboarding a new site should be able to answer "will this work?"
   * before any data depends on the answer.
   */
  async preview(streamKey: string, content: string, filename?: string) {
    if (!content?.trim()) throw badReq('The sample file is empty');

    const type = await StreamType.findOne({ key: streamKey, deletedAt: null }).lean();
    if (!type) throw badReq(`No stream type named "${streamKey}"`, 'UNKNOWN_STREAM_TYPE');

    const parser = getStreamParser(type.parserKey);
    if (!parser) {
      throw badReq(`"${type.name}" has no parser installed (${type.parserKey})`, 'PARSER_UNAVAILABLE');
    }

    // `assumeComplete`: a pasted or uploaded sample is whole by definition. The
    // SFTP path deliberately assumes the opposite, because a missing terminator
    // there means the logger was still writing.
    const parsed = parser.parse(content, { assumeComplete: true });

    const recognised = parsed.header.filter((h) => parser.columns?.some((c) =>
      c.aliases.some((a) => a.toLowerCase() === h.trim().toLowerCase()),
    ));
    const unrecognised = parsed.header.filter((h) => !recognised.includes(h));

    return {
      streamKey,
      parserKey: type.parserKey,
      filename: filename ?? null,
      ok: parsed.ok,
      rejectReason: parsed.rejectReason,
      header: parsed.header,
      recognisedColumns: recognised,
      // Named explicitly rather than silently dropped — an operator seeing their
      // sensor listed here knows immediately why its readings are missing.
      ignoredColumns: unrecognised,
      sensorsSeen: parsed.sensorsSeen,
      unitCode: parsed.unitCode,
      stats: parsed.stats,
      /** A handful of rows, exactly as they would be stored. */
      sampleRows: parsed.rows.slice(0, PREVIEW_ROWS).map((r) => ({
        timestampMs: r.timestampMs,
        timestamp: new Date(r.timestampMs).toISOString(),
        windSpeedMs: r.windSpeedMs,
        windDirRelDeg: r.windDirRelDeg,
        tempC: r.tempC,
        humidityPct: r.humidityPct,
        pressureHpa: r.pressureHpa,
      })),
      totalRows: parsed.rows.length,
      /** Nothing was written. Stated in the payload so the UI can say so. */
      persisted: false,
    };
  }

  /** Enable or disable a type. Disabling strands nothing already assigned. */
  /**
   * Switch one STATION on or off for one stream type.
   *
   * Per station, not per format: the type-level switch it replaces was never
   * enforced anywhere — ingest resolves its parser from the code registry and
   * never read it — so it looked like a kill switch and stopped nothing. This
   * one is checked on the ingest path, and a file for a disabled type is
   * quarantined rather than dropped.
   */
  async setStationEnabled(stationAccountId: string, streamTypeKey: string, enabled: boolean) {
    if (!Types.ObjectId.isValid(stationAccountId)) throw new NotFoundException('Station not found');

    const station = await StationAccount.findById(stationAccountId);
    if (!station) throw new NotFoundException('Station not found');

    const current = new Set(station.disabledStreamTypes ?? []);
    if (enabled) current.delete(streamTypeKey);
    else current.add(streamTypeKey);
    station.disabledStreamTypes = [...current];
    await station.save();

    return {
      stationAccountId: String(station._id),
      streamType: streamTypeKey,
      enabled,
      disabledStreamTypes: station.disabledStreamTypes,
    };
  }
}
