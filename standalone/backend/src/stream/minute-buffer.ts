import { MINUTE_MS } from '../ingest/minute-aggregate';

/**
 * Holds each minute's readings until the minute is complete.
 *
 * A file said "this minute is finished" by ending. A stream never does, so this
 * decides for itself. A minute is complete when:
 *   - a reading for a LATER minute arrives — the normal case, once a second; or
 *   - the minute ended more than `graceMs` ago — the link dropped or the sensor
 *     went quiet, and waiting for a next reading could mean waiting forever.
 *
 * Readings are timestamped on receipt by the PC clock, so they arrive in order.
 * The exception is the clock itself stepping backwards (a time-sync correction):
 * a reading for a minute already written is DROPPED and counted, not merged —
 * merging a handful of late seconds would overwrite that minute's means with a
 * mean of just those seconds.
 */
export interface Timestamped {
  timestampMs: number;
}

export class MinuteBuffer<T extends Timestamped> {
  private readonly minutes = new Map<number, T[]>();
  /** Start of the newest minute already handed on. */
  private lastFlushedMinute = -Infinity;
  /** Readings dropped because their minute was already written. */
  late = 0;

  constructor(private readonly graceMs = 5_000) {}

  /** Add a reading; returns any minutes it completed, oldest first. */
  add(reading: T): T[][] {
    const minute = Math.floor(reading.timestampMs / MINUTE_MS) * MINUTE_MS;
    if (minute <= this.lastFlushedMinute) {
      this.late += 1;
      return [];
    }
    const done = this.take((m) => m < minute);
    const bucket = this.minutes.get(minute);
    if (bucket) bucket.push(reading);
    else this.minutes.set(minute, [reading]);
    return done;
  }

  /** Minutes that ended more than the grace period before `nowMs`. */
  due(nowMs: number): T[][] {
    return this.take((m) => m + MINUTE_MS + this.graceMs <= nowMs);
  }

  /** Everything held — on shutdown, so a part-minute is written rather than lost. */
  drain(): T[][] {
    return this.take(() => true);
  }

  /** Readings waiting, for the status page. */
  get size(): number {
    let n = 0;
    for (const b of this.minutes.values()) n += b.length;
    return n;
  }

  private take(pick: (minuteMs: number) => boolean): T[][] {
    const keys = [...this.minutes.keys()].filter(pick).sort((a, b) => a - b);
    const out: T[][] = [];
    for (const k of keys) {
      out.push(this.minutes.get(k)!);
      this.minutes.delete(k);
      if (k > this.lastFlushedMinute) this.lastFlushedMinute = k;
    }
    return out;
  }
}
