/**
 * The instrument compliance tables of §5.1–5.4, as the proposal states them:
 * what the Statement of Requirements asks for, and what is provided. The
 * equipment panel shows the rows for the instruments actually fitted, so a
 * reviewer at Canterbury sees the radar's table and not the anemometer's.
 *
 * `status` keeps the proposal's own qualifier — "Comply", "Comply (confirm)",
 * "Comply (configurable)", "Comply / clarify" — because "confirm" items are
 * exactly the ones still open with MTS (§15).
 */
export type ComplianceStatus = 'comply' | 'confirm' | 'configurable' | 'clarify';

export interface ComplianceRow {
  requirement: string;
  provided: string;
  status: ComplianceStatus;
}

/** A datasheet table the proposal prints beside the compliance table (§5.2, Appendix A). */
export interface SpecTable {
  title: string;
  rows: [string, string][];
}

export const INSTRUMENT_COMPLIANCE: Record<
  'rainfall' | 'level' | 'temperature' | 'wind' | 'pumps',
  { title: string; section: string; rows: ComplianceRow[]; specs?: SpecTable[] }
> = {
  rainfall: {
    title: 'RIMCO 7499 tipping-bucket rain gauge',
    section: '§5.1',
    rows: [
      { requirement: 'Tipping bucket or approved equivalent', provided: 'RIMCO 7499, the BOM-standard tipping-bucket gauge', status: 'comply' },
      { requirement: 'Range 0–200 mm/hr (min)', provided: 'Operates across and beyond 0–200 mm/hr', status: 'comply' },
      { requirement: 'Accuracy ±2% ≤ 50 mm/hr; ±3% > 50 mm/hr', provided: 'Verified by factory calibration certificate', status: 'confirm' },
      { requirement: 'Resolution 0.2 mm per tip (or better)', provided: '0.2 mm tip (0.1 mm option)', status: 'comply' },
      { requirement: 'Event-based reporting + 10-min rolling totals', provided: 'Tip logging plus 10-min, 1/6/24-hour rolling totals on the OMC-048', status: 'configurable' },
      { requirement: 'Ingress protection IP66 (min)', provided: 'IP rating confirmed on the selected model', status: 'confirm' },
      { requirement: 'Self-cleaning / anti-blockage; avoid splash', provided: 'Bird-guard options; sited clear of overhangs and splash; cleaned at each visit', status: 'comply' },
      { requirement: '≥ 25 mm/hr, ≥ 45 mm/3 h, ≥ 120 mm/3 days with vigilance', provided: 'All windows, thresholds and the 6/12/48 h vigilance-and-reset logic in the alert engine (§7)', status: 'configurable' },
    ],
  },
  level: {
    title: 'YGRD-65-D radar + RSF80 float switch',
    section: '§5.2',
    rows: [
      { requirement: 'Non-contact radar preferred; pressure transducer acceptable', provided: 'Non-contact 120 GHz radar (primary) plus contact float (verification and backup trigger)', status: 'comply' },
      { requirement: 'Range 0–3,000 mm above datum (min)', provided: 'YGRD-65-D reads 0.1–50 m; mounting height set per location', status: 'comply' },
      { requirement: 'Accuracy ±5 mm or ±0.5% of reading', provided: '±1 mm', status: 'comply' },
      { requirement: 'Resolution 1 mm', provided: '0.1 mm', status: 'comply' },
      { requirement: 'Continuous; fast reporting above 50% of warning', provided: 'Sampled continuously; every minute above half the standing-water line', status: 'configurable' },
      { requirement: 'IP68 sensor head; IP66 electronics', provided: 'Radar above water, IP67 (IP68 optional); sealed float; IP66 cabinet', status: 'clarify' },
      { requirement: 'Manual gauge; anti-vandal fixed mounting', provided: 'Staff gauge at each site, 10 mm graduations, same datum', status: 'comply' },
      { requirement: 'Rate-of-rise detection, independent of level', provided: 'Rate-of-rise alarm in addition to absolute thresholds', status: 'configurable' },
      { requirement: 'Lowest point; standing water / rail foot / falling wording', provided: 'Sited at the lowest point; three flood states with Annexure C wording', status: 'configurable' },
    ],
    specs: [
      {
        title: 'YGRD-65-D radar — datasheet',
        rows: [
          ['Principle', '120 GHz terahertz FMCW, non-contact; 3° beam with false-echo learning'],
          ['Range', '0.1–50 m (30 m model 0.1–30 m); blind zone ≈ 100 mm'],
          ['Accuracy / resolution', '±1 mm / 0.1 mm'],
          ['Output', 'RS-485 Modbus RTU (4–20 mA and SDI-12 options)'],
          ['Power', '12–24 VDC, ≈ 40 mA'],
          ['Ingress protection', 'IP67 (IP68 optional), cast-aluminium housing, lens antenna'],
          ['Operating temperature', '−30 to +80 °C'],
          ['Pedigree', 'Tested by China’s MWR hydrological instrument centre; proven on open channels'],
        ],
      },
      {
        title: 'RS PRO RSF80 float switch — datasheet',
        rows: [
          ['Type and mounting', 'External vertical float; ½ in. NPT through-wall — no chamber entry to fit or service'],
          ['Body', 'PPS (or PVDF) for gritty, sediment-laden floodwater'],
          ['Contact', 'Reversible N/O or N/C — wired fail-safe (a broken wire reads as water)'],
          ['Switching rating', '240 V AC / 120 V DC, 0.6 A, 25 VA resistive'],
          ['Actuation band (SG 1)', 'Must-close ≈ 7–9 mm, must-open ≈ 20–24 mm — built-in hysteresis'],
          ['Minimum fluid SG', '0.85 (floodwater ≈ 1.0)'],
          ['Temperature', '−20 to +75 °C (Nylon) up to −10 to +120 °C (PPS)'],
          ['Connection', 'Sealed M12 (recommended) or 100 cm flying lead'],
        ],
      },
      {
        title: 'Manual staff gauge — construction',
        rows: [
          ['Plate', 'H34 5005 aluminium, 0.6 × 1000 × 130 mm, yellow-coated'],
          ['Markings', 'Black alkyd enamel, screen-printed; read to 10 mm'],
          ['Datum', 'Zero on the same survey datum as the radar; procedure in the O&M manual'],
          ['Mounting', 'On the 2.5 m mast beside the radar; marine-grade, UV-stable, vandal-resistant'],
        ],
      },
    ],
  },
  temperature: {
    title: 'Gill GMX300 temperature / RH',
    section: '§5.3',
    rows: [
      { requirement: 'Range −20 °C to +70 °C (min)', provided: 'Covers the operational band; +70 °C ceiling confirmed against the datasheet', status: 'confirm' },
      { requirement: 'Accuracy ±0.3 °C or better', provided: 'By calibration certificate; integrated radiation screen', status: 'confirm' },
      { requirement: 'Resolution 0.1 °C or better', provided: '0.1 °C', status: 'comply' },
      { requirement: 'Reporting configurable, default 1-minute', provided: '1-minute logging on the OMC-048', status: 'configurable' },
      { requirement: 'Ingress protection IP66 (min)', provided: 'To be confirmed for the selected unit', status: 'confirm' },
      { requirement: 'Radiation shield, 1.5 m above rail', provided: 'Integrated screen, 1.5–2 m, shaded, clear of concrete and asphalt', status: 'comply' },
      { requirement: '≥ 38 / ≥ 45 °C rising (> 5 min), falling (> 10 min)', provided: 'Rising/falling thresholds, dwell timers and TSR / heat-patrol wording in the alert engine', status: 'configurable' },
    ],
  },
  wind: {
    title: 'Gill WindSonic 75 ultrasonic anemometer',
    section: '§5.4',
    rows: [
      { requirement: 'Ultrasonic (preferred) or cup/vane', provided: 'Ultrasonic, no moving parts', status: 'comply' },
      { requirement: 'Speed range 0–75 m/s (min)', provided: '0–75 m/s (270 km/h) in full', status: 'comply' },
      { requirement: 'Speed accuracy ±0.3 m/s or ±3%', provided: 'Confirmed per selected model', status: 'confirm' },
      { requirement: 'Direction 0–360°, ±3°', provided: 'Confirmed per selected model', status: 'confirm' },
      { requirement: '2-min mean and 3-s gust, both reported', provided: 'Both computed and reported', status: 'configurable' },
      { requirement: 'Ingress protection IP66 (min)', provided: 'To be confirmed', status: 'confirm' },
      { requirement: 'Mounting ≥ 10 m above rail (or per location)', provided: 'VM5F mast; bridge sites allow for wind channelling', status: 'comply' },
      { requirement: '≥ 75 / ≥ 85 km/h TSR and ≥ 120 km/h block-line wording', provided: 'Gust-or-mean thresholds and per-location wording in the alert engine', status: 'configurable' },
    ],
  },
  pumps: {
    title: 'Existing trackside pumps — integration',
    section: '§5.5, Appendix A',
    rows: [
      { requirement: 'Pumps at the Marrickville flood site', provided: 'Existing on site; integrated to, not supplied', status: 'comply' },
      { requirement: 'Auto on/off from flood sensors', provided: 'OMC-048 starts and stops them from the radar, float as independent backup; alarms on run, fail, no-flow', status: 'comply' },
      { requirement: 'Duty / standby operation', provided: 'Lead/lag start levels, alternation, standby cut-in on a duty fault — matched to the existing pumps', status: 'confirm' },
      { requirement: 'Pump status and leading-indicator alarms', provided: 'Run, fault and (where available) condition signals read and alerted', status: 'comply' },
      { requirement: 'Clear of KE + 200 mm at all times', provided: 'Logger cabinet and cabling outside the kinematic envelope + 200 mm', status: 'comply' },
      { requirement: 'Existing outfall and pipework', provided: 'Unchanged — as installed', status: 'comply' },
      { requirement: 'Electrical supply', provided: 'Existing supply; the OMC-048 interface is low-voltage and never switches the motor supply', status: 'confirm' },
    ],
    specs: [
      {
        title: 'Integration interface (typical) — Appendix A',
        rows: [
          ['Start/stop — duty (lead)', 'OMC-048 volt-free relay (RO1) → panel remote-start / contactor input'],
          ['Start/stop — standby / assist', 'Second relay (RO2); energised at high-high or on a duty-pump fault'],
          ['Pump run confirmation', 'Digital input from the panel’s run / status auxiliary contacts, per pump'],
          ['Pump fault / trip', 'Digital input from the common-fault / motor-protection auxiliary contacts'],
          ['Pump condition (where available)', 'Existing condition outputs (e.g. Grundfos IO 113, temperature / seal alarms)'],
          ['Level demand source', 'YGRD-65-D radar (primary) and RSF80 float (independent backup)'],
        ],
      },
    ],
  },
};
