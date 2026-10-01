import type { LocationId, ParameterId } from '@/lib/api/types';
import { STORM_DAY, sydneyMinuteOfDay } from '../clock';
import { fbm, hash, noise } from './rng';
import { THRESHOLDS } from '../seed/thresholds';
import { LGD_PANEL, campsieRadarOut } from '../seed/incidents';

/**
 * What each measurement does over a day, as a pure function of time.
 *
 * The point of modelling the *weather* rather than drawing random lines is that
 * the screens then agree with each other without being told to: rain rises, the
 * radar level follows it a little later, the pumps start because the level crossed
 * the set point, and the flood event log reads as cause and effect. A reviewer
 * checks exactly that kind of consistency.
 *
 * `DEMO_EPOCH` anchors the story: the scenario is written around 14:30 local, the
 * moment the client's own mockups depict.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Which day this is relative to the storm: 0 is the storm day, -1 yesterday. */
function dayIndex(t: number): number {
  return Math.floor((t - STORM_DAY) / DAY);
}

/** Minutes into the Sydney day — the clock every screen prints. */
function minuteOfDay(t: number): number {
  return sydneyMinuteOfDay(t);
}

/** A smooth 0..1 bump centred on `centre` minutes, `width` minutes wide. */
function bump(minute: number, centre: number, width: number): number {
  const x = (minute - centre) / width;
  return Math.exp(-x * x);
}

/**
 * The rain story, shared by every rain-fitted station: a band of rain arriving
 * early afternoon, peaking just past 14:00, which is what puts Marrickville over
 * the 25 mm/hr line and starts the pumps.
 */
export function rainfallMmHr(locationId: LocationId, t: number): number {
  const seed = hash(`${locationId}:rain`);
  const m = minuteOfDay(t);
  // Centred on the scenario's "now" (14:32) so the band is at its peak when the
  // portal is opened — the alert history, the ticker and the live tile all
  // describe the same moment, and they have to agree.
  const day = dayIndex(t);
  /* The storm is a single afternoon. Other days get ordinary weather — a shower
     the morning before and one three days back (which is what brings the 3-day
     total to its line during the storm), a wet morning a week earlier, and
     nothing anywhere near a threshold. */
  const band =
    day === 0
      ? bump(m, 13 * 60 + 40, 100) * 33 + bump(m, 9 * 60, 60) * 4
      : day === -3
        ? bump(m, 16 * 60, 80) * 11
        : day === -1
          ? bump(m, 5 * 60 + 30, 70) * 8
          : day === -8
            ? bump(m, 11 * 60, 80) * 11
            : 0;
  /* Texture inside a rain band, and an occasional passing shower outside one.
     This used to be a constant drizzle — every hour of every day was wet, which
     the rainfall heatmap made obvious and which quietly added ~20 mm to every
     3-day total. Most hours are now dry, as most Sydney hours are. */
  const n = fbm(seed, t, 11 * 60_000, 3);
  const inBand = band > 1;
  const texture = inBand ? (n - 0.5) * 3 : Math.max(0, n - 0.8) * 14;
  // Belmore sits at the edge of the band: enough to warn, not enough to alert.
  const exposure = locationId === 'marrickville' ? 1 : locationId === 'belmore' ? 0.55 : 0.3;
  return Math.max(0, band * exposure + texture);
}

/**
 * Rolling accumulations — the rule engine's actual inputs. The window is
 * half-open, (t − window, t], sampled on the 5-minute grid, which is the same
 * convention generate/tallies.ts uses — an earlier version counted both ends and
 * ran a twelfth heavy.
 */
export function rainAccumMm(locationId: LocationId, t: number, windowMs: number): number {
  const stepMs = 5 * 60_000;
  const end = Math.floor(t / stepMs) * stepMs;
  let total = 0;
  for (let u = end - windowMs + stepMs; u <= end; u += stepMs) {
    total += (rainfallMmHr(locationId, u) * stepMs) / HOUR;
  }
  return Math.round(total * 10) / 10;
}

/**
 * Water level above the rail-foot datum, in mm. It lags the rain by about forty
 * minutes and drains slowly, which is why the flood screen's two locations peak at
 * different times and why the level is still high after the rain has eased.
 */
export function waterLevelMm(locationId: LocationId, t: number): number {
  const seed = hash(`${locationId}:level`);
  const lag = 40 * 60_000;
  const catchment =
    locationId === 'marrickville'
      ? 1.08
      : locationId === 'marrickville-dulwich-hill'
        ? 0.85
        : locationId === 'canterbury'
          ? 1.12
          : 0.3;
  /* A dry drain reads close to its datum. A higher baseline put Marrickville
     above the fast-reporting line all morning, before a drop of rain fell. */
  let level = 6 + fbm(seed, t, 47 * 60_000, 2) * 8;
  // integrate the recent rain, decaying
  const stepMs = 10 * 60_000;
  for (let u = t - 6 * HOUR; u <= t - lag; u += stepMs) {
    const age = (t - lag - u) / HOUR;
    /* 0.70 mm of standing water per mm/hr of rain, decaying: it puts Marrickville
       just over the rail foot at the peak of the storm and back under it by the
       evening. A bigger coefficient made the track half a metre under water. */
    level += rainfallMmHr(locationId, u) * 0.7 * catchment * Math.exp(-age / 3.2);
  }
  return Math.round(level);
}

/** The high-level float: wet once the radar confirms a high level. */
export function floatWet(locationId: LocationId, t: number): boolean {
  return waterLevelMm(locationId, t) >= THRESHOLDS.flood.pumpStartMm - 5;
}

/** Air temperature: a diurnal curve, coolest before dawn, peaking mid-afternoon. */
export function temperatureC(locationId: LocationId, t: number): number {
  const seed = hash(`${locationId}:temp`);
  const m = minuteOfDay(t);
  const diurnal = -Math.cos(((m - 60) / (24 * 60)) * 2 * Math.PI);
  const base = 17.5 + diurnal * 6.2;
  // the rain band cools things off
  const cooling = rainfallMmHr(locationId, t) * 0.12;
  return Math.round((base + fbm(seed, t, 37 * 60_000, 2) * 1.1 - cooling) * 10) / 10;
}

/** Relative humidity: the mirror of temperature, pinned high while it rains. */
export function humidityPct(locationId: LocationId, t: number): number {
  const seed = hash(`${locationId}:rh`);
  const temp = temperatureC(locationId, t);
  const wet = Math.min(30, rainfallMmHr(locationId, t) * 1.6);
  const rh = 96 - (temp - 11) * 3.1 + wet + fbm(seed, t, 29 * 60_000, 2) * 3;
  return Math.round(Math.max(28, Math.min(99, rh)) * 10) / 10;
}

/** Mean wind, km/h. Freshens through the afternoon with the front. */
export function windMeanKmh(locationId: LocationId, t: number): number {
  const seed = hash(`${locationId}:wind`);
  const m = minuteOfDay(t);
  const front = bump(m, 15 * 60, 150) * 26;
  const base = 14 + fbm(seed, t, 23 * 60_000, 3) * 12 + front;
  return Math.round(base * 10) / 10;
}

/**
 * Gust, km/h. Always above the mean by a plausible gust factor — never crossing
 * below it, which is the sort of detail a meteorologist reviewer notices first.
 */
export function windGustKmh(locationId: LocationId, t: number): number {
  const seed = hash(`${locationId}:gust`);
  const mean = windMeanKmh(locationId, t);
  const factor = 1.32 + noise(seed, t, 4 * 60_000) * 0.42;
  return Math.round(mean * factor * 10) / 10;
}

/** Battery state of charge: discharges overnight, recovers once the sun is up. */
export function batteryPct(loggerId: string, t: number): number {
  const seed = hash(`${loggerId}:batt`);
  const m = minuteOfDay(t);
  const solar = Math.max(0, Math.sin(((m - 6 * 60) / (12 * 60)) * Math.PI));
  const base = 78 + solar * 20 - (1 - solar) * 6;
  const drift = fbm(seed, t, 3 * DAY, 2) * 6;
  /* The down-tunnel unit had a bad night before the storm — a soiled panel had
     been under-yielding for three days (the charge controller's flag), and it
     bottomed out at 38 % just before first light. The health screen and the alert history both say so; this is
     where that is actually true, rather than just written down. */
  const dip = loggerId === 'LGD-DN-01' && dayIndex(t) === 0 ? bump(m, 5 * 60 + 30, 150) * (base + drift - 38) : 0;
  return Math.round(Math.max(35, Math.min(100, base + drift - dip)));
}

/**
 * Wind direction, degrees true.
 *
 * Three Sydney regimes, mixed as vectors (averaging compass angles directly sends
 * a NW and a NE wind "south"): the morning westerly off the land, the afternoon
 * north-easterly sea breeze on a fine day, and the southerly change that arrives
 * with the storm front. It is what gives the wind rose its shape.
 */
export function windDirDeg(locationId: LocationId, t: number): number {
  const seed = hash(`${locationId}:dir`);
  const m = minuteOfDay(t);
  const front = dayIndex(t) === 0 ? bump(m, 14 * 60 + 30, 200) : dayIndex(t) === -8 ? bump(m, 11 * 60, 120) * 0.8 : 0;
  const seaBreeze = bump(m, 15 * 60 + 30, 170) * (1 - front) * (0.6 + fbm(seed, t, DAY, 2) * 0.5);
  const westerly = Math.max(0.15, 1 - seaBreeze - front);
  const regimes: [number, number][] = [
    [285, westerly],
    [45, seaBreeze],
    [200, front * 1.4],
  ];
  let x = 0;
  let y = 0;
  for (const [deg, w] of regimes) {
    x += Math.cos((deg * Math.PI) / 180) * w;
    y += Math.sin((deg * Math.PI) / 180) * w;
  }
  const jitter = (noise(seed, t, 25 * 60_000) - 0.5) * 50;
  return Math.round((((Math.atan2(y, x) * 180) / Math.PI + jitter) % 360 + 360) % 360);
}

/** Solar input, W, from a 400 W array. */
export function solarInputW(loggerId: string, t: number): number {
  const seed = hash(`${loggerId}:pv`);
  const m = minuteOfDay(t);
  const sun = Math.max(0, Math.sin(((m - 6 * 60) / (12 * 60)) * Math.PI));
  const cloud = 1 - Math.min(0.85, rainfallMmHr('belmore', t) * 0.06);
  const soiled = loggerId === 'LGD-DN-01' && t >= LGD_PANEL.underYieldFrom && t < LGD_PANEL.cleanedAt ? LGD_PANEL.soiledYield : 1;
  return Math.round(400 * sun * cloud * soiled * (0.8 + noise(seed, t, 9 * 60_000) * 0.2));
}

/**
 * Barometric pressure, hPa — the GMX300 measures it alongside temperature and
 * humidity. A front announces itself in the pressure before the rain arrives,
 * so the storm day shows the fall a forecaster would recognise: a steady drop
 * through the morning, the low as the band passes, and a quick recovery behind
 * it. Other days drift gently, with the twice-daily atmospheric tide on top.
 */
export function pressureHpa(locationId: LocationId, t: number): number {
  const seed = hash(`${locationId}:pres`);
  const m = minuteOfDay(t);
  const day = dayIndex(t);
  const tide = Math.cos(((m - 10 * 60) / (12 * 60)) * 2 * Math.PI) * 0.9;
  const drift = (fbm(seed, t, 2 * DAY, 2) - 0.5) * 8;
  const front = day === 0 ? -bump(m, 13 * 60 + 20, 210) * 11 : day === 1 ? -Math.max(0, 1 - m / 240) * 2 : 0;
  const height = locationId === 'windsor-road' ? -2.4 : 0;
  return Math.round((1016 + drift + tide + front + height) * 10) / 10;
}

/** Campsie's radar fault window: from 10:58 on the storm day, not yet repaired. */
export function isCampsieRadarOut(t: number): boolean {
  return campsieRadarOut(t);
}

/** One entry point, so callers never branch on parameter themselves. */
export function valueAt(
  parameter: ParameterId,
  locationId: LocationId,
  t: number,
  sensorId?: string,
): number | null {
  /**
   * The two Lady Game Drive tunnel points are separate catchments and read
   * differently — showing them identical would suggest one sensor feeding two
   * boxes, which is the opposite of the redundancy the design is for.
   */
  const offset = sensorId?.includes('-DN-') ? 1 : 0;
  const loggerId = sensorId;
  /* Campsie's radar stops answering at 10:58 on the storm day — the fault the
     alert log, the data-quality list, the health findings and the maintenance
     mode all describe. From then on there is no radar reading at all: the card
     says so and the chart line stops, while the float switch carries on. */
  if (parameter === 'water_level' && locationId === 'campsie' && isCampsieRadarOut(t)) return null;
  if (offset && parameter === 'water_level') {
    return Math.round(waterLevelMm(locationId, t) * 0.82) - 4;
  }
  if (offset && parameter === 'float_switch') {
    return Math.round(waterLevelMm(locationId, t) * 0.82) - 4 >= THRESHOLDS.flood.pumpStartMm - 5 ? 1 : 0;
  }
  switch (parameter) {
    case 'rainfall':
      /* "Rainfall intensity" is the rolling one-hour total — the PDF's own
         definition of the ≥ 25 mm/hr rule (§7.3, "≥ 25 mm in 1 h (rolling)").
         Showing the instantaneous rate instead had the card turn red twenty
         minutes before the rule it was supposedly showing actually fired. */
      return rainAccumMm(locationId, t, HOUR);
    case 'rain_1h':
      return rainAccumMm(locationId, t, HOUR);
    case 'rain_3h':
      return rainAccumMm(locationId, t, 3 * HOUR);
    case 'rain_3d':
      return rainAccumMm(locationId, t, 3 * DAY);
    case 'rain_10m':
      return rainAccumMm(locationId, t, 10 * 60_000);
    case 'rain_6h':
      return rainAccumMm(locationId, t, 6 * HOUR);
    case 'rain_24h':
      return rainAccumMm(locationId, t, DAY);
    case 'wind_dir':
      return windDirDeg(locationId, t);
    case 'pressure':
      return pressureHpa(locationId, t);
    case 'water_level':
      return waterLevelMm(locationId, t);
    case 'float_switch':
      return floatWet(locationId, t) ? 1 : 0;
    case 'temperature':
      return temperatureC(locationId, t);
    case 'humidity':
      return humidityPct(locationId, t);
    case 'wind_mean':
      return windMeanKmh(locationId, t);
    case 'wind_gust':
      return windGustKmh(locationId, t);
    case 'battery':
      return batteryPct(loggerId ?? locationId, t);
    case 'solar_input':
      return solarInputW(loggerId ?? locationId, t);
    default:
      return null;
  }
}
