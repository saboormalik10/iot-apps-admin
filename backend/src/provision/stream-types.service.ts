import { Injectable } from '@nestjs/common';
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
@Injectable()
export class StreamTypesService {
  /** Everything an operator needs to choose a stream type, in one call. */
  async list() {
    const [configured, stations] = await Promise.all([
      StreamType.find({ deletedAt: null }).sort({ name: 1 }).lean(),
      StationAccount.aggregate<{ _id: string; n: number }>([
        { $group: { _id: '$streamType', n: { $sum: 1 } } },
      ]),
    ]);

    const inUse = new Map(stations.map((s) => [s._id, s.n]));
    const parsers = new Map(listStreamParsers().map((p) => [p.key, p]));

    return configured.map((t) => {
      const parser = parsers.get(t.parserKey);
      return {
        id: String(t._id),
        key: t.key,
        parserKey: t.parserKey,
        name: t.name,
        description: t.description || parser?.description || '',
        isEnabled: t.isEnabled,
        isBuiltIn: t.isBuiltIn,
        /** False when no parser answers to `parserKey` — the interesting case. */
        parserAvailable: Boolean(parser),
        stationCount: inUse.get(t.key) ?? 0,
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
  async setEnabled(id: string, isEnabled: boolean) {
    if (!Types.ObjectId.isValid(id)) throw badReq('Unknown stream type', 'NOT_FOUND');
    const updated = await StreamType.findByIdAndUpdate(id, { $set: { isEnabled } }, { new: true }).lean();
    if (!updated) throw badReq('Unknown stream type', 'NOT_FOUND');
    return { id: String(updated._id), key: updated.key, isEnabled: updated.isEnabled };
  }
}
