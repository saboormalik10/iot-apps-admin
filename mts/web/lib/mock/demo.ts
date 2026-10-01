import { getSpeed, isPaused, jumpToInstant, now, pause, resetClock, resume, setSpeed } from './clock';
import { seededEvents } from './seed/events';
import { mutate } from './store';

/**
 * The prototype's own time controls — not part of the product.
 *
 * The demo opens at 14:32, at the height of the storm, which means that a
 * reviewer never sees what the proposal says happens next: the vigilance
 * countdown running out (§7.2), the water trending down and the staged
 * reinstatement (§7.3), the pumps stopping at L-stop (§5.6), the PTZ prompt at
 * Canterbury (§7.5). These controls play time forward or jump to those moments.
 *
 * The jump targets come from the event log itself, so they cannot drift from it.
 */
const STORY: { id: string; label: string }[] = [
  { id: 'evt-rise-fast', label: 'Water starts rising fast' },
  { id: 'evt-duty-start', label: 'Duty pump starts' },
  { id: 'evt-rain-alert', label: 'Rainfall alert — patrol' },
  { id: 'evt-standby-start', label: 'Standby pump assists' },
  { id: 'evt-rail-foot', label: 'Block the line' },
  { id: 'evt-canterbury-ptz', label: 'PTZ check — Canterbury' },
  { id: 'evt-trending-down', label: 'Trending down' },
  { id: 'evt-rail-foot-clear', label: 'Below rail foot' },
  { id: 'evt-pumps-off', label: 'Pumps stop' },
  { id: 'evt-vigilance-end', label: 'Rain all-clear' },
  /* The morning after: WO-0412 closes, the radar reads again, maintenance ends. */
  { id: 'evt-campsie-restored', label: 'Campsie radar repaired' },
];

export function storyPoints(): { t: number; label: string; id: string }[] {
  const all = seededEvents(Number.MAX_SAFE_INTEGER);
  return STORY.map((s) => {
    const e = all.find((x) => x.id === s.id);
    return e ? { t: e.t, label: s.label, id: s.id } : null;
  }).filter((x): x is { t: number; label: string; id: string } => x !== null);
}

/** Ping every data subscriber, so screens re-read after time moves. */
function refresh(): void {
  mutate(() => undefined);
}

export function demoJumpTo(t: number): void {
  // Ten seconds early, so the moment itself happens on screen.
  jumpToInstant(t - 10_000);
  refresh();
}

export function demoSetSpeed(x: number): void {
  if (isPaused()) resume();
  setSpeed(x);
  refresh();
}

export function demoPause(): void {
  pause();
  refresh();
}

export function demoReset(): void {
  resetClock();
  refresh();
}

export function demoState(): { now: number; speed: number; paused: boolean } {
  return { now: now(), speed: getSpeed(), paused: isPaused() };
}
