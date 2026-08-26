import 'dotenv/config';
import mongoose from 'mongoose';

import {
  getStreamParser,
  listStreamParsers,
  registerStreamParser,
  unregisterStreamParser,
} from '../src/ingest/registry';
import { StreamType } from '../src/models/StreamType';

/**
 * Parser registry (M22 W1).
 *
 * The point of the registry is that onboarding a new sensor format becomes a
 * registry entry rather than surgery through `ingest.service`. So the tests that
 * matter are the ones about REGISTRATION being safe and lookup being honest —
 * an unknown type must be refused loudly, not silently parsed as wind.
 */

jest.setTimeout(60_000);

describe('the registry', () => {
  afterEach(() => {
    unregisterStreamParser('test-stream');
  });

  it('resolves the built-in MET parser', () => {
    const parser = getStreamParser('met-csv');
    expect(parser).not.toBeNull();
    expect(parser!.label).toMatch(/wind/i);
  });

  it('returns null for an unknown type rather than guessing', () => {
    // Falling back to MET would parse a water-quality file as wind and store
    // nonsense that looks like data.
    expect(getStreamParser('water-quality')).toBeNull();
    expect(getStreamParser('')).toBeNull();
  });

  it('accepts a new parser and makes it resolvable', () => {
    registerStreamParser({
      key: 'test-stream',
      label: 'Test',
      description: 'x',
      parse: () => ({
        ok: true, rejectReason: null, header: [], rows: [], sensorsSeen: [], unitCode: null,
        stats: { totalLines: 0, dataLines: 0, skipped: 0, truncatedTail: false, firstTsMs: null, lastTsMs: null },
      }),
    });
    expect(getStreamParser('test-stream')).not.toBeNull();
  });

  it('REFUSES to replace an existing key', () => {
    // Two modules disagreeing about how a customer's files are read, with load
    // order deciding, is the worst possible failure here.
    expect(() =>
      registerStreamParser({
        key: 'met-csv',
        label: 'Impostor',
        description: 'x',
        parse: () => {
          throw new Error('should never run');
        },
      }),
    ).toThrow(/already registered/i);
  });

  it('still resolves the original after a rejected replacement', () => {
    expect(getStreamParser('met-csv')!.label).toMatch(/wind/i);
  });

  it('lists what is available, for the admin UI', () => {
    const keys = listStreamParsers().map((p) => p.key);
    expect(keys).toContain('met-csv');
  });

  it('parses through the registry exactly as the direct call does', () => {
    const csv = 'timestamp,direction,speed,units,status\n2026-08-25T11:19:00+10:00,350,0.50,K,A\n';
    const viaRegistry = getStreamParser('met-csv')!.parse(csv, { assumeComplete: true });

    expect(viaRegistry.ok).toBe(true);
    expect(viaRegistry.rows).toHaveLength(1);
    expect(viaRegistry.rows[0].windDirRelDeg).toBe(350);
    expect(viaRegistry.unitCode).toBe('K');
  });

  it('passes assumeComplete through, which decides the fate of the last row', () => {
    // No trailing terminator means the logger may still have been writing, so
    // the final line is DROPPED — unless the caller knows the file is complete,
    // as the admin upload does. Getting this backwards is what silently lost the
    // last row of every admin import in M15.
    const noNewline = 'timestamp,direction,speed,units,status\n2026-08-25T11:19:00+10:00,350,0.50,K,A';
    const parser = getStreamParser('met-csv')!;

    expect(parser.parse(noNewline, { assumeComplete: true }).rows).toHaveLength(1);
    expect(parser.parse(noNewline).rows).toHaveLength(0);
  });
});

describe('StreamType configuration', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI as string, { serverSelectionTimeoutMS: 30_000 });
  });
  afterAll(async () => {
    await StreamType.deleteMany({ key: /^test-/ });
    await mongoose.disconnect();
  });

  it('has the built-in MET type seeded', async () => {
    const t = await StreamType.findOne({ key: 'met-csv', organizationId: null, deletedAt: null }).lean();
    expect(t).not.toBeNull();
    expect(t!.isBuiltIn).toBe(true);
    expect(t!.isEnabled).toBe(true);
  });

  it('points every configured type at a parser that exists', async () => {
    // A type naming a missing parser would accept stations and then reject every
    // file they send — a failure that only shows up in production.
    const types = await StreamType.find({ deletedAt: null }).lean();
    for (const t of types) {
      expect([t.key, getStreamParser(t.parserKey) !== null]).toEqual([t.key, true]);
    }
  });

  it('frees the key when a type is soft-deleted', async () => {
    // Partial unique index, matching Role: a plain one would make deletion
    // permanently reserve the key.
    const key = `test-${Date.now()}`;
    const first = await StreamType.create({ key, parserKey: 'met-csv', name: 'T' });
    await StreamType.updateOne({ _id: first._id }, { $set: { deletedAt: new Date() } });
    const second = await StreamType.create({ key, parserKey: 'met-csv', name: 'T again' });
    expect(String(second._id)).not.toBe(String(first._id));
  });

  it('allows the same key for two different customers', async () => {
    const key = `test-shared-${Date.now()}`;
    await StreamType.create({ key, parserKey: 'met-csv', name: 'A', organizationId: new mongoose.Types.ObjectId() });
    await expect(
      StreamType.create({ key, parserKey: 'met-csv', name: 'B', organizationId: new mongoose.Types.ObjectId() }),
    ).resolves.toBeTruthy();
  });
});
