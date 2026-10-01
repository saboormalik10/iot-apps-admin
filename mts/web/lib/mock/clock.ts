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
 * Daylight saving is handled without a library: a wall-clock time is placed by
 * reading the wall clock back and correcting by the difference, which is exactly
 * the hour that went missing (first Sunday of October) or repeated (first Sunday
 * of April). Sydney's changeover falls inside a month of history every spring and
 * autumn, so "an hour out" would show on every day-binned chart and every
 * seeded time on the far side of it.
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

/** Wall-clock minutes of `t` minus `target`, folded into (−12 h, +12 h]. */
function wallDiffMin(t: number, target: number): number {
  let d = sydneyMinuteOfDay(t) - target;
  if (d > 720) d -= 1440;
  if (d <= -720) d += 1440;
  return d;
}

/** The instant of midnight in Sydney on the day `t` falls in — DST-correct. */
export function sydneyDayStart(t: number): number {
  const d = sydneyFields(t);
  const guess = t - (d.getHours() * 3_600_000 + d.getMinutes() * 60_000 + d.getSeconds() * 1_000 + d.getMilliseconds());
  /* On a changeover day the subtraction counts an hour that did not happen (or
     misses one that happened twice); read the guess back and correct it. */
  return guess - wallDiffMin(guess, 0) * 60_000;
}

/**
 * The instant at Sydney wall-clock `hour:minute`, `dayOffset` days from the day
 * of `base`. Every seeded time in the demo is written this way, so "02:29 five
 * days ago" reads 02:29 even with a clock change in between.
 */
export function sydneyAt(base: number, dayOffset: number, hour: number, minute = 0): number {
  // From noon: never near a changeover, so whole days can be added safely.
  const noon = sydneyDayStart(base) + dayOffset * 86_400_000 + 12 * 3_600_000;
  const t = sydneyDayStart(noon) + (hour * 60 + minute) * 60_000;
  return t - wallDiffMin(t, hour * 60 + minute) * 60_000;
}

function anchorFor(realNow: number): number {
  return sydneyAt(realNow, 0, ANCHOR_HOUR, ANCHOR_MINUTE) + 4_000;
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
