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

export const INSTRUMENT_COMPLIANCE: Record<'rainfall' | 'level' | 'temperature' | 'wind', { title: string; section: string; rows: ComplianceRow[] }> = {
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
};
