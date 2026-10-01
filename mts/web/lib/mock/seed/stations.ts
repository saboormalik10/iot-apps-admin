import type { LocationId, SensorFit, StationLocation } from '@/lib/api/types';

/**
 * The seven locations and eight loggers of the M1 corridor, from the Statement of
 * Requirements (§3, and the fit-out table in the proposal).
 *
 * Location 6, Lady Game Drive, is two completely separate units — up tunnel and
 * down tunnel, each with its own logger, solar panel and cellular link — but the
 * client asked for it to be shown as ONE place with two monitoring points, so it is
 * one entry here with two loggers.
 *
 * `chainage.provisional` is true throughout: Rev B §13 asks MTS to supply the real
 * kilometrages, track and rail values. The UI renders provisional figures visibly
 * as placeholders rather than asserting them — see PLAN.md, "Saying it is a
 * prototype".
 *
 * `map.x/y` are positions on the schematic corridor (a 0–100 space, laid out by
 * `components/corridor/corridor-geometry.ts`), not geography.
 */

function logger(
  id: string,
  label: string,
  over: Partial<StationLocation['loggers'][number]> = {},
): StationLocation['loggers'][number] {
  return {
    id,
    label,
    model: 'OMC-048',
    online: true,
    batteryPct: 96,
    solarInputW: 180,
    charging: true,
    signal: { network: '4G', rssiDbm: -72 },
    enclosure: { closed: true, internalC: 41 },
    lastSeen: 0,
    ...over,
  };
}

const rain = (id: string): SensorFit => ({
  parameter: 'rainfall',
  sensorId: id,
  model: 'RIMCO 7499 tipping bucket (0.2 mm/tip)',
  unit: 'mm/hr',
});
const level = (id: string): SensorFit => ({
  parameter: 'water_level',
  sensorId: id,
  model: 'YGRD-65-D radar (mm above datum)',
  unit: 'mm',
});
const float = (id: string): SensorFit => ({
  parameter: 'float_switch',
  sensorId: id,
  model: 'RS PRO RSF80 high-level backup',
  unit: '',
});
const temp = (id: string): SensorFit => ({
  parameter: 'temperature',
  sensorId: id,
  model: 'Gill GMX300',
  unit: '°C',
});
const humidity = (id: string): SensorFit => ({
  parameter: 'humidity',
  sensorId: id,
  model: 'Gill GMX300',
  unit: '%RH',
});
const windMean = (id: string): SensorFit => ({
  parameter: 'wind_mean',
  sensorId: id,
  model: 'Gill WindSonic 75 (10 m)',
  unit: 'km/h',
});
const windDir = (id: string): SensorFit => ({
  parameter: 'wind_dir',
  sensorId: id,
  model: 'Gill WindSonic 75 (10 m)',
  unit: '°',
});
const pressure = (id: string): SensorFit => ({
  parameter: 'pressure',
  sensorId: id,
  model: 'Gill GMX300',
  unit: 'hPa',
});
const windGust = (id: string): SensorFit => ({
  parameter: 'wind_gust',
  sensorId: id,
  model: 'Gill WindSonic 75 (10 m)',
  unit: 'km/h',
});

export const STATIONS: StationLocation[] = [
  {
    id: 'marrickville',
    name: 'Marrickville',
    ordinal: 1,
    corridor: 'southwest',
    chainage: { label: 'MSW 6.480–6.690', km: 6.48, provisional: true },
    track: 'both',
    loggers: [logger('MKV-01', 'Marrickville')],
    sensors: [rain('MKV-RIMCO-01'), level('MKV-YGRD-01'), float('MKV-RSF80-01')],
    pumpStation: {
      id: 'MKV-PUMP',
      label: 'Trackside pumps — Marrickville',
      dutyStandby: true,
      capacityLps: 120,
    },
    cameraUrl: '#ptz-marrickville',
    map: { x: 10, y: 92, labelSide: 'above' },
  },
  {
    id: 'marrickville-dulwich-hill',
    name: 'Marrickville–Dulwich Hill',
    ordinal: 2,
    corridor: 'southwest',
    chainage: { label: 'MSW 7.100–7.260', km: 7.1, provisional: true },
    track: 'both',
    loggers: [logger('MDH-01', 'Marrickville–Dulwich Hill')],
    sensors: [
      level('MDH-YGRD-01'),
      float('MDH-RSF80-01'),
      temp('MDH-GMX-01'),
      humidity('MDH-GMX-01'),
      pressure('MDH-GMX-01'),
      windMean('MDH-WS-01'),
      windGust('MDH-WS-01'),
      windDir('MDH-WS-01'),
    ],
    map: { x: 25, y: 89, labelSide: 'above' },
  },
  {
    id: 'canterbury',
    name: 'Canterbury',
    ordinal: 3,
    corridor: 'southwest',
    chainage: { label: 'MSW 10.070–10.550', km: 10.07, provisional: true },
    track: 'both',
    loggers: [logger('CAN-01', 'Canterbury')],
    sensors: [level('CAN-YGRD-01'), float('CAN-RSF80-01')],
    cameraUrl: '#ptz-canterbury',
    map: { x: 41, y: 86, labelSide: 'above' },
  },
  {
    id: 'campsie',
    name: 'Campsie',
    ordinal: 4,
    corridor: 'southwest',
    chainage: { label: 'MSW 12.300–12.480', km: 12.3, provisional: true },
    track: 'both',
    loggers: [logger('CAM-01', 'Campsie')],
    sensors: [level('CAM-YGRD-01'), float('CAM-RSF80-01')],
    map: { x: 57, y: 83, labelSide: 'above' },
  },
  {
    id: 'belmore',
    name: 'Belmore triangle',
    ordinal: 5,
    corridor: 'southwest',
    chainage: { label: 'MSW 14.020–14.260', km: 14.02, provisional: true },
    track: 'both',
    loggers: [logger('BEL-01', 'Belmore triangle')],
    sensors: [
      rain('BEL-RIMCO-01'),
      level('BEL-YGRD-01'),
      float('BEL-RSF80-01'),
      temp('BEL-GMX-01'),
      humidity('BEL-GMX-01'),
      pressure('BEL-GMX-01'),
      windMean('BEL-WS-01'),
      windGust('BEL-WS-01'),
      windDir('BEL-WS-01'),
    ],
    map: { x: 75, y: 79, labelSide: 'above' },
  },
  {
    id: 'lady-game-drive',
    name: 'Lady Game Drive (tunnel)',
    ordinal: 6,
    corridor: 'northwest',
    chainage: { label: 'MNW 3.210–3.470', km: 3.21, provisional: true },
    track: 'both',
    /* Two independent units, one place on screen. */
    loggers: [
      logger('LGD-UP-01', 'Up tunnel'),
      logger('LGD-DN-01', 'Down tunnel', { batteryPct: 91, signal: { network: '5G', rssiDbm: -66 } }),
    ],
    sensors: [
      level('LGD-UP-YGRD-01'),
      float('LGD-UP-RSF80-01'),
      level('LGD-DN-YGRD-01'),
      float('LGD-DN-RSF80-01'),
    ],
    map: { x: 60, y: 10, labelSide: 'below' },
  },
  {
    id: 'windsor-road',
    name: 'Windsor Road SSC',
    ordinal: 7,
    corridor: 'northwest',
    chainage: { label: 'MNW 8.940–9.120', km: 8.94, provisional: true },
    track: 'both',
    loggers: [logger('WSR-01', 'Windsor Road SSC', { batteryPct: 94, signal: { network: '4G', rssiDbm: -76 } })],
    sensors: [
      temp('WSR-GMX-01'),
      humidity('WSR-GMX-01'),
      pressure('WSR-GMX-01'),
      windMean('WSR-WS-01'),
      windGust('WSR-WS-01'),
      windDir('WSR-WS-01'),
    ],
    map: { x: 24, y: 11, labelSide: 'below' },
  },
];

export const STATIONS_BY_ID: Record<LocationId, StationLocation> = Object.fromEntries(
  STATIONS.map((s) => [s.id, s]),
) as Record<LocationId, StationLocation>;

/** 8 loggers across 7 locations — the count the portal reports in its header. */
export const LOGGER_COUNT = STATIONS.reduce((n, s) => n + s.loggers.length, 0);

export function stationsWith(parameter: SensorFit['parameter']): StationLocation[] {
  return STATIONS.filter((s) => s.sensors.some((sensor) => sensor.parameter === parameter));
}
