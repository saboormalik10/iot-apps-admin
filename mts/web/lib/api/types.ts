/**
 * The wire contract.
 *
 * These are the shapes a real API would return, written on the real-API side of
 * the boundary on purpose: they are a deliverable of this prototype, because they
 * are what the two sides are agreeing to. `lib/mock/*` produces them today; an
 * HTTP client produces them tomorrow, and nothing above this file changes.
 *
 * Vocabulary follows the client's documents — location, logger, chainage, track,
 * rail, duty/standby, vigilance — so a reviewer reads their own words back.
 */

// ── measurements ────────────────────────────────────────────────────────────

/** The parameters the M1 stations measure. */
export type ParameterId =
  | 'rainfall'
  | 'rain_1h'
  | 'rain_3h'
  | 'rain_3d'
  | 'rain_10m'
  | 'rain_6h'
  | 'rain_24h'
  | 'water_level'
  | 'float_switch'
  | 'temperature'
  | 'humidity'
  | 'wind_mean'
  | 'wind_gust'
  /** WindSonic 75: direction 0–360°, the quarter the wind blows FROM. */
  | 'wind_dir'
  /** GMX300: barometric pressure, which it measures alongside temperature and humidity (§4). */
  | 'pressure'
  | 'battery'
  | 'solar_input';

export type Unit = 'mm/hr' | 'mm' | '°C' | '%RH' | 'km/h' | '%' | 'W' | 'V' | '°' | 'hPa' | '';

/** Normal / Warning / Alert — the status a single reading carries. */
export type ReadingStatus = 'normal' | 'warning' | 'alert' | 'stale' | 'missing';

export interface Reading {
  t: number;
  v: number | null;
  status?: ReadingStatus;
}

export interface Series {
  parameter: ParameterId;
  unit: Unit;
  points: Reading[];
}

// ── locations and loggers ───────────────────────────────────────────────────

export type LocationId =
  | 'marrickville'
  | 'marrickville-dulwich-hill'
  | 'canterbury'
  | 'campsie'
  | 'belmore'
  | 'lady-game-drive'
  | 'windsor-road';

export type Corridor = 'southwest' | 'northwest';

/** Which way the track runs past the station — carried on every alert. */
export type TrackDirection = 'up' | 'down' | 'both';

export interface Logger {
  /** e.g. `MKV-01`, or `LGD-UP-01` / `LGD-DN-01` for the two tunnel units. */
  id: string;
  label: string;
  model: 'OMC-048';
  online: boolean;
  batteryPct: number;
  solarInputW: number;
  charging: boolean;
  signal: { network: '4G' | '5G'; rssiDbm: number };
  enclosure: { closed: boolean; internalC: number };
  lastSeen: number;
}

export interface SensorFit {
  parameter: ParameterId;
  /** Per-sensor identifier, as the history table shows it: `MKV-RIMCO-01`. */
  sensorId: string;
  model: string;
  unit: Unit;
}

export interface StationLocation {
  id: LocationId;
  name: string;
  /** "Location 1", as the client numbers them. */
  ordinal: number;
  corridor: Corridor;
  /**
   * Chainage as the client writes it (`MSW 6.480–6.690`) plus the numeric km the
   * corridor map lays out from. MTS supplies the real values — see PLAN.md.
   */
  chainage: { label: string; km: number; provisional: true };
  track: TrackDirection;
  loggers: Logger[];
  sensors: SensorFit[];
  /** Marrickville only, in this scheme. */
  pumpStation?: PumpStationRef;
  /** A PTZ camera the "standing water" alert links to. */
  cameraUrl?: string;
  /** Where the pin sits on the schematic. */
  map: { x: number; y: number; labelSide: 'above' | 'below' };
}

export interface PumpStationRef {
  id: string;
  label: string;
  dutyStandby: boolean;
  capacityLps: number;
}

// ── live state ──────────────────────────────────────────────────────────────

export interface LiveReading {
  parameter: ParameterId;
  sensorId: string;
  value: number | null;
  unit: Unit;
  status: ReadingStatus;
  /** What the rule says, rendered: "Threshold ≥ 25 mm/hr (1 h)". */
  thresholdLabel?: string;
  /** Supporting line under the value: "3 h total 92 mm". */
  note?: string;
  updatedAt: number;
  /** A short trail for the card's sparkline — same source as `value`. */
  spark: Reading[];
}

export type StationStatus = 'normal' | 'warning' | 'alert' | 'offline';

export interface StationLive {
  location: StationLocation;
  status: StationStatus;
  readings: LiveReading[];
  /** Set when a "standing water" alert wants camera verification. */
  cameraVerification?: boolean;
  updatedAt: number;
}

// ── pumps ───────────────────────────────────────────────────────────────────

export type PumpRole = 'duty' | 'standby';
export type PumpState = 'running' | 'ready' | 'stopped' | 'fault';
export type ControlMode = 'auto' | 'manual';

export interface Pump {
  id: string;
  role: PumpRole;
  state: PumpState;
  flowLps: number;
  runHoursToday: number;
  starts: number;
  since?: number;
  lastRun?: number;
  note?: string;
}

/** The four tiles the mockup shows for the existing pumps. */
export interface PumpCondition {
  statorTempC: number;
  waterInOil: 'dry' | 'wet';
  insulationMohm: number;
  bearingTempC: number;
}

export interface PumpStationLive {
  id: string;
  label: string;
  mode: ControlMode;
  state: PumpState;
  pumps: Pump[];
  condition: PumpCondition;
  setpoints: { pumpStartMm: number; highHighMm: number; railFootMm: number };
  activity: ActivityEntry[];
}

export interface ActivityEntry {
  t: number;
  text: string;
  severity: Severity;
  /** Marks an action this prototype only simulated. */
  simulated?: boolean;
}

/**
 * A pump command and the supervisory chain the real system will have. The
 * prototype fills the first step and shows the rest awaiting integration — the UI
 * must never imply a command reached plant that it did not.
 */
export interface PumpCommand {
  pumpId: string;
  action: 'start' | 'stop';
  mode: ControlMode;
  confirmedBy: string;
}

export type CommandStep = 'issued' | 'acknowledged' | 'contactor' | 'flow';

export interface PumpCommandResult {
  accepted: boolean;
  simulated: true;
  steps: { step: CommandStep; state: 'done' | 'pending' | 'not-integrated'; at?: number }[];
  message: string;
}

// ── alerts ──────────────────────────────────────────────────────────────────

export type Severity = 'alert' | 'warning' | 'information' | 'cleared';
export type AlertCategory =
  | 'rainfall'
  | 'flood'
  | 'pump'
  | 'temperature'
  | 'wind'
  | 'camera'
  | 'fault'
  | 'power';

export interface AlertEvent {
  id: string;
  severity: Severity;
  category: AlertCategory;
  locationId: LocationId;
  locationName: string;
  /** The operational wording — this is what a controller acts on. */
  message: string;
  detail?: string;
  t: number;
  /** Every alert carries these, per the Statement of Requirements. */
  track: TrackDirection;
  rail: TrackDirection;
  chainageLabel: string;
  cameraUrl?: string;
  acknowledgement?: { by: string; at: number };
  autoCleared?: boolean;
  /** True where our own wording stands in for MTS-approved wording. */
  draftWording?: boolean;
}

export interface EventsQuery {
  /** A relative window, so the caller does not have to know the demo clock. */
  withinDays?: number;
  severity?: Severity | 'all';
  unacknowledgedOnly?: boolean;
  locationId?: LocationId | 'all';
  from?: number;
  to?: number;
  page?: number;
  pageSize?: number;
}

// ── rules ───────────────────────────────────────────────────────────────────

export type RuleWindow = 'instant' | '1h-rolling' | '3h-rolling' | '3d-rolling';

export interface AlertRule {
  id: string;
  name: string;
  parameter: ParameterId;
  group: 'rainfall' | 'flood' | 'temperature' | 'wind';
  /** "≥ 25 mm / 1 h (rolling)" — rendered from the fields below. */
  operator: 'gte' | 'lte';
  value: number;
  unit: Unit;
  window: RuleWindow;
  dwell?: string;
  vigilance?: string;
  resetOnRetrigger: boolean;
  /**
   * §7.3: a rule can be enabled, disabled or SCHEDULED — active only between two
   * dates, e.g. a heat rule for summer or a temporary rule during track works.
   */
  schedule?: { from: string; to: string };
  /** The trigger in words, where "≥ value unit" would misstate it (rate of rise, trending down). */
  condition?: string;
  severity: Severity;
  appliesTo: LocationId[];
  message: string;
  draftWording?: boolean;
  recipients: string[];
  channels: ChannelId[];
  enabled: boolean;
}

/** One physical instrument in the asset register (Admin → Sensors). */
export type InstrumentKind = 'rain' | 'level' | 'float' | 'gmx' | 'wind';

export interface Instrument {
  /** The sensor ID, as the history and alerts quote it: `MKV-RIMCO-01`. */
  sensorId: string;
  locationId: LocationId;
  locationName: string;
  loggerId: string;
  kind: InstrumentKind;
  model: string;
  terminal: string;
  serial: string;
  mounting: string;
  installedAt: number;
  calibrationDueAt?: number;
  certificate?: string;
  /** Rain gauges only: rain per tip of the bucket, mm. Every tip count is multiplied by it. */
  bucketMm?: BucketMm;
  /** Commissioning: installed, not yet trusted — no readings feed alerts until it is in service. */
  status: 'in-service' | 'commissioning' | 'decommissioned';
  /** Added in this session — simulated. */
  added?: boolean;
  note?: string;
}

/** The tipping-bucket sizes a rain gauge can have. */
export const BUCKET_SIZES = [0.1, 0.2, 0.5, 1.0] as const;
export type BucketMm = (typeof BUCKET_SIZES)[number];

export type InstrumentInput = Pick<Instrument, 'sensorId' | 'locationId' | 'loggerId' | 'kind' | 'serial' | 'mounting' | 'certificate' | 'bucketMm'> & {
  calibrationDueAt?: number;
  note?: string;
};

/** §8.6: what the solar charge controller reports to the logger. */
export interface ChargeController {
  loggerId: string;
  socPct: number;
  pvW: number;
  batteryV: number;
  /** + charging, − discharging. */
  netA: number;
  flags: { id: string; label: string; active: boolean; since?: number }[];
}

/** A Blue2Care work order, as of now: steps not yet done have no time. */
export interface WorkOrder {
  id: string;
  locationId: LocationId;
  locationName: string;
  loggerId: string;
  title: string;
  kind: 'fault' | 'leading-indicator';
  raisedAt: number;
  assignee: string;
  eventId?: string;
  steps: { key: 'response' | 'investigation' | 'repair'; label: string; dueAt?: number; doneAt?: number; note?: string }[];
  closedAt?: number;
}

/** One logger's last day, in cells — the health screen's availability strip. */
export interface LoggerStrip {
  loggerId: string;
  locationId: LocationId;
  cells: { from: number; to: number; state: 'ok' | 'partial' | 'silent'; note?: string }[];
}

/** One published version of the rule set (§7.3). */
export interface RuleVersion {
  version: number;
  /** Seeded versions: [days from the storm day, hour, minute]. */
  at: [number, number, number] | number;
  by: string;
  summary: string;
  changes: { rule: string; field: string; from: string; to: string }[];
  /** Published in this session — simulated. */
  session?: boolean;
}

/** A dry run of one rule against stored readings: what it would have done. */
export interface RuleSimulation {
  locationId: LocationId;
  /** What was tested — "1-hour rolling rainfall", "rate of rise". */
  metric: string;
  unit: string;
  /** The parameter whose colour the line wears. */
  parameter: ParameterId;
  points: Reading[];
  from: number;
  to: number;
  /** Raised alerts. */
  fires: number[];
  /** Re-triggers inside a running countdown — no new alert, the countdown restarts. */
  resets: number[];
  /** The rule in force (after any dwell), until it clears (after any clear dwell). */
  inForce: { from: number; to: number }[];
  /** The vigilance countdown that follows. */
  vigilance: { from: number; to: number }[];
  peak: { t: number; v: number } | null;
  /** Trending-down only: when a block armed the rule, if it is armed at the end. */
  armedAt?: number;
  dwellMin: number;
  clearDwellMin: number;
  vigilanceHours: number;
  /** Why the test could not run, or what to bear in mind reading it. */
  note?: string;
}

export type ChannelId = 'screen' | 'push' | 'email' | 'sms';

export interface Channel {
  id: ChannelId;
  label: string;
  available: boolean;
  /** Why a channel is greyed — shown rather than hidden. */
  reason?: string;
}

// ── people ──────────────────────────────────────────────────────────────────

export type RoleId = 'super-user' | 'administrator' | 'operator' | 'pump-controller' | 'maintainer' | 'analyst' | 'viewer';

// ── organisations ───────────────────────────────────────────────────────────

/**
 * The three things an organisation's own Administrator may do only when the
 * Super User has granted it. Every new organisation starts with all three off.
 */
export type OrgRight = 'addUsers' | 'addStations' | 'addSensors';

export interface OrgRightState {
  on: boolean;
  /** Who last changed it, and when. */
  by?: string;
  at?: number;
}

export interface Organization {
  id: string;
  name: string;
  /** Short code, used in folder paths and IDs: `MTS`. */
  code: string;
  region: string;
  createdAt: number;
  createdBy: string;
  rights: Record<OrgRight, OrgRightState>;
  /** Filled in by the API: how many users and stations it has. */
  userCount?: number;
  stationCount?: number;
  /** Created in this session — simulated. */
  added?: boolean;
}

export type StationMeasure = 'rain' | 'flood' | 'temp' | 'wind' | 'pump';

/** A station as the Super User / an organisation registers it. */
export interface StationRecord {
  id: string;
  orgId: string;
  orgName: string;
  name: string;
  ordinal: number;
  chainage: string;
  gps?: { lat: number; lng: number };
  loggerId: string;
  track: TrackDirection;
  measures: StationMeasure[];
  /** Live: reporting. Commissioning: registered, no data yet — not on the map until positioned. */
  status: 'live' | 'commissioning';
  createdAt: number;
  createdBy: string;
  added?: boolean;
}

export interface StationInput {
  orgId: string;
  name: string;
  chainage: string;
  gps?: { lat: number; lng: number };
  loggerId: string;
  track: TrackDirection;
  measures: StationMeasure[];
}

export interface Role {
  id: RoleId;
  name: string;
  typicalUser: string;
  summary: string;
  permissions: string[];
}

export type UserStatus = 'active' | 'suspended' | 'invited';

export interface User {
  id: string;
  name: string;
  email: string;
  initials: string;
  roles: RoleId[];
  /** `'all'` or specific locations. */
  stationAccess: 'all' | LocationId[];
  /** The organisation the person belongs to. Absent = MTS; `platform` = the Super User. */
  orgId?: string;
  status: UserStatus;
  lastLogin?: number;
  /** §8.4: taken on the add-user form. Used for SMS in the client's PDF. */
  mobile?: string;
  notify?: NotifyPrefs;
}

/** §8.4 "notification preferences": which channels, for which severities. */
export interface NotifyPrefs {
  channels: ChannelId[];
  severities: Severity[];
  /** A quiet period for non-alert notifications; alerts always come through. */
  quietHours?: { from: string; to: string };
}

export interface AuditEntry {
  id: string;
  t: number;
  actor: string;
  action: string;
  detail: string;
  category: 'user' | 'role' | 'rule' | 'alert' | 'pump' | 'auth' | 'maintenance' | 'organisation' | 'station';
}

// ── health ──────────────────────────────────────────────────────────────────

export type HealthCondition =
  | 'inoperable'
  | 'unresponsive'
  | 'missing-sensor-data'
  | 'missing-pump-data'
  | 'low-battery';

export interface HealthFinding {
  locationId: LocationId;
  locationName: string;
  loggerId: string;
  condition: HealthCondition;
  since: number;
  detail: string;
  severity: Severity;
}

// ── history query ───────────────────────────────────────────────────────────

export type QueryInterval = 'raw' | '10min' | '1h' | '1d';

export interface HistoryQuery {
  locationIds: LocationId[];
  parameters: ParameterId[];
  from: number;
  to: number;
  interval: QueryInterval;
  page?: number;
  pageSize?: number;
}

export interface HistoryRow {
  t: number;
  locationId: LocationId;
  locationName: string;
  parameter: ParameterId;
  parameterLabel: string;
  value: number | null;
  unit: Unit;
  status: ReadingStatus;
  sensorId: string;
}

// ── envelopes ───────────────────────────────────────────────────────────────

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

// ── insights: the data behind the operational charts ─────────────────────────

/** One of the three rainfall rules of §7.2, as the tally board sees it now. */
export interface VigilanceRule {
  id: 'intensity' | 'short' | 'multiDay';
  label: string;
  windowLabel: string;
  thresholdMm: number;
  vigilanceHours: number;
  /** The rolling tally right now. */
  tallyMm: number;
  /**
   * breached — the tally is over the line; the countdown has not started
   * vigilance — back under the line; the countdown is running
   * clear — no qualifying rain inside the look-back, or the all-clear has gone out
   */
  state: 'breached' | 'vigilance' | 'clear';
  firstBreachAt?: number;
  /** When the tally last fell back under the line — the countdown's start. */
  belowAt?: number;
  /** When vigilance ends if no further qualifying rain falls. */
  endsAt?: number;
  /** When the all-clear was (or will be) issued. */
  clearedAt?: number;
  /** Re-triggers within the window, each of which restarted the countdown. */
  resets: number;
  /** Tally over time, for the chart. */
  trail: { t: number; v: number }[];
}

export interface VigilanceStatus {
  locationId: LocationId;
  locationName: string;
  rules: VigilanceRule[];
}

/** A band on the corridor timeline: when a location was over which line. */
export interface ExceedanceBand {
  locationId: LocationId;
  from: number;
  to: number;
  severity: 'warning' | 'alert';
  label: string;
}

export interface DeliveryAttempt {
  channel: ChannelId;
  queuedAt: number;
  deliveredAt?: number;
  attempts: number;
  state: 'delivered' | 'retried' | 'failed' | 'not-in-scope';
  recipients: number;
  note?: string;
}

export interface EventDelivery {
  eventId: string;
  /** §7.1: 5 minutes for weather, 30 for a system fault. */
  slaMinutes: number;
  attempts: DeliveryAttempt[];
}

export interface Annotation {
  id: string;
  eventId: string;
  by: string;
  at: number;
  text: string;
}

export interface OutageRecord {
  loggerId: string;
  locationId: LocationId;
  from: number;
  hours: number;
  cause: string;
  planned: boolean;
}

export interface AvailabilityBudget {
  loggerId: string;
  locationId: LocationId;
  label: string;
  /** Unplanned hours in the last 12 months, against the 24 h allowance. */
  hours12m: number;
  /** The longest single unplanned outage in the last 6 months, against 12 h. */
  longest6m: number;
  outages: OutageRecord[];
}

export interface CalibrationItem {
  sensorId: string;
  locationId: LocationId;
  instrument: string;
  lastCalibrated: number;
  dueAt: number;
  certificate: string;
  state: 'current' | 'due-soon' | 'overdue';
}

export interface QualityFlag {
  id: string;
  t: number;
  locationId: LocationId;
  sensorId: string;
  parameter: ParameterId;
  value: number;
  rule: 'range' | 'rate-of-change' | 'frozen' | 'cross-check';
  detail: string;
  action: 'quarantined' | 'flagged';
}

export interface PumpDay {
  day: number;
  /** Minutes run by each physical pump — lead/lag alternates each cycle. */
  pump1Min: number;
  pump2Min: number;
  starts: number;
}

export interface PumpProtection {
  floatWet: boolean;
  /** A rise must hold this long at L-start before the lead pump starts. */
  debounceS: number;
  lStartMm: number;
  lLagMm: number;
  lStopMm: number;
  railFootMm: number;
  floatTripMm: number;
  deadBandMm: number;
  minRunMin: number;
  minRestMin: number;
  maxStartsPerHour: number;
  startsLastHour: number;
  leadPump: 1 | 2;
  radarFloatAgreement: 'agree' | 'discrepancy';
  controlSource: 'radar' | 'float-backup';
  levelMm: number;
}

export interface PowerTrail {
  loggerId: string;
  locationId: LocationId;
  label: string;
  soc: Reading[];
  pv: Reading[];
  voltage: number;
  chargeW: number;
  /** Days the battery would last now with no sun at all. */
  autonomyDays: number;
}

export interface MaintenanceWindow {
  id: string;
  from: number;
  to: number;
  scope: string;
  possession: string;
  notifiedAt: number;
}

export interface WindRoseBin {
  /** Sector centre, degrees true, 16 sectors. */
  dirDeg: number;
  /** Share of time (0–1) in each speed band, low → high. */
  bands: number[];
}

/** §4 / §8.5: how a station's logger is reporting right now. */
export interface Telemetry {
  loggerId: string;
  label: string;
  loggingIntervalS: number;
  transmitIntervalMin: number;
  lastTransmission: number;
  /** Event-triggered transmissions today — a breach does not wait for the cycle. */
  eventSendsToday: number;
  /** §5.2: above half the warning level the logger reports every minute. */
  fastReporting: boolean;
  bufferedReadings: number;
  lastBackfill?: { at: number; readings: number; gapMin: number };
  messagesToday: number;
}

/** §5.2: the manual staff gauge, read by eye beside the radar. */
export interface StaffGaugeCheck {
  sensorId: string;
  label: string;
  at: number;
  by: string;
  staffMm: number;
  radarMm: number;
}

export interface MaintenanceState {
  on: boolean;
  by?: string;
  since?: number;
  reason?: string;
}
