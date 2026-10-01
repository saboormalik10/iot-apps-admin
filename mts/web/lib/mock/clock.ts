/**
 * The demo clock.
 *
 * The scenario is written around 14:32 on a wet afternoon — the moment the
 * client's own mockups depict — so the prototype pins "now" to that point in the
 * current day rather than to the wall clock. Opening it at 9 a.m. would otherwise
 * show a calm, dry night and none of the story.
 *
 * Time then advances normally (or faster, from the demo dock), so the header clock
 * ticks and "updated 12 s ago" counts up. The readings themselves are pure
 * functions of this clock — see generate/profiles.ts — so everything on screen
 * moves together and nothing drifts out of agreement.
 */

/** Sydney time the scenario is anchored to. */
const ANCHOR_HOUR = 14;
const ANCHOR_MINUTE = 32;

/**
 * The corridor is in Sydney and every time on screen is printed in AEST, so the
 * weather has to be generated in Sydney time too. Reading the *machine's* hours
 * put the afternoon storm at 19:32 on the clock in the header — internally
 * consistent, but nonsense to anyone reading it, and wrong again on a UTC host
 * like Vercel.
 *
 * (Day boundaries across the DST changeover are an hour out. For a demo whose
 * history is a month of ordinary weather that is not worth a timezone library.)
 */
const TZ = 'Australia/Sydney';

/**
 * How far to shift an instant so a `Date`'s *local* fields read as Sydney's.
 *
 * Cached per hour: the generator calls this inside its innermost loop — the
 * three-day rainfall accumulation alone is seven hundred samples — and running
 * `Intl` there pinned a core and left the page repainting forever.
 */
const deltaCache = new Map<number, number>();

function sydneyDelta(t: number): number {
  const bucket = Math.floor(t / 3_600_000);
  let delta = deltaCache.get(bucket);
  if (delta === undefined) {
    /* toLocaleString drops milliseconds, so measure from a whole second. Taken
       from `t` itself, the offset came out up to 999 ms short depending on which
       instant first filled the cache — and "midnight" then landed on a different
       millisecond for different hours, splitting one day into two in every
       per-day tally (the pump card read "0 starts" beside a pump that had
       started). */
    const whole = Math.floor(t / 1000) * 1000;
    delta = new Date(new Date(whole).toLocaleString('en-US', { timeZone: TZ })).getTime() - whole;
    deltaCache.set(bucket, delta);
  }
  return delta;
}

function sydneyFields(t: number): Date {
  return new Date(t + sydneyDelta(t));
}

/** Minutes into the Sydney day. */
export function sydneyMinuteOfDay(t: number): number {
  const d = sydneyFields(t);
  return d.getHours() * 60 + d.getMinutes();
}

/** The instant of midnight in Sydney on the day `t` falls in. */
export function sydneyDayStart(t: number): number {
  const d = sydneyFields(t);
  return t - (d.getHours() * 3_600_000 + d.getMinutes() * 60_000 + d.getSeconds() * 1_000 + d.getMilliseconds());
}

function anchorFor(realNow: number): number {
  return sydneyDayStart(realNow) + (ANCHOR_HOUR * 60 + ANCHOR_MINUTE) * 60_000 + 4_000;
}

let realStart = Date.now();
let demoStart = anchorFor(realStart);

/**
 * Local midnight of the day the storm happens.
 *
 * The scenario is one wet afternoon, not the climate. Anchoring the rain band to
 * this day — instead of to "every day at 14:32" — is what stops the history
 * screens showing a flood every day of the month and the trends screen showing
 * yesterday's 400 mm peak that no alert was ever raised for.
 */
export const STORM_DAY = sydneyDayStart(demoStart);
let speed = 1;
let paused = false;
let pausedAt = demoStart;

/** The demo's current time, in ms. */
export function now(): number {
  if (paused) return pausedAt;
  return demoStart + (Date.now() - realStart) * speed;
}

export function setSpeed(next: number): void {
  const t = now();
  speed = next;
  demoStart = t;
  realStart = Date.now();
}

export function pause(): void {
  if (paused) return;
  pausedAt = now();
  paused = true;
}

export function resume(): void {
  if (!paused) return;
  demoStart = pausedAt;
  realStart = Date.now();
  paused = false;
}

export function isPaused(): boolean {
  return paused;
}

export function getSpeed(): number {
  return speed;
}

/** Jump the demo to a Sydney time of day, keeping the demo's date. */
export function jumpTo(hour: number, minute = 0): void {
  demoStart = sydneyDayStart(now()) + (hour * 60 + minute) * 60_000;
  realStart = Date.now();
  pausedAt = demoStart;
}

/** Jump the demo to an exact instant. */
export function jumpToInstant(t: number): void {
  demoStart = t;
  realStart = Date.now();
  pausedAt = t;
}

export function resetClock(): void {
  realStart = Date.now();
  demoStart = anchorFor(realStart);
  speed = 1;
  paused = false;
  pausedAt = demoStart;
}

export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
