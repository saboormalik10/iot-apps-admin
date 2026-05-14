/**
 * MET-LINK dataSentence CSV parser
 *
 * The MET-LINK Ionic app stores one sensor reading per second as a CSV string
 * (`dataSentence`) in its SQLite `measure` table. Each row is a repeating
 * triplet pattern:  Value,Unit,Description  (one triplet per sensor), with the
 * phone's GPS coordinates appended as the last two comma-separated values.
 *
 * The first row of every record is a header row whose triplets contain
 * the literal text "Unit" and "Description" as placeholders instead of actual
 * values — we detect this and mark it rowType = "header" without parsing
 * sensor values.
 *
 * The parser converts every known triplet into named, typed fields so the
 * admin dashboard can query them directly (e.g. tempC, pressureHpa, etc.).
 * All values are stored in BASE UNITS:
 *   - Wind speed  → m/s
 *   - Pressure    → hPa  (XDR transmits in bar 'B'; 1 bar = 1000 hPa)
 *   - Temperature → °C
 *   - Altitude    → m
 */

export interface ParsedMeasure {
  rowType: 'header' | 'data';
  // Wind
  windSpeedMs: number | null;
  windSpeedKmh: number | null;
  windSpeedKnots: number | null;
  windSpeedRelMs: number | null;
  windSpeedTrueMs: number | null;
  windDirRelDeg: number | null;
  windDirTrueDeg: number | null;
  // Atmosphere
  tempC: number | null;
  humidityPct: number | null;
  pressureHpa: number | null;
  precipMm: number | null;
  precipRateMmHr: number | null;
  solarWm2: number | null;
  voltageV: number | null;
  batteryVoltageV: number | null;
  currentA: number | null;
  dewPointC: number | null;
  qnhHpa: number | null;
  qfeHpa: number | null;
  // Hardware GPS (from $GPGGA — the station's own GPS module)
  gpsLat: number | null;
  gpsLng: number | null;
  gpsAltM: number | null;
  gpsSatellites: number | null;
  gpsHorDilution: number | null;
  gpsGeoidalSepM: number | null;
  gpsQuality: number | null;
  // Phone GPS (operator's phone location — last two CSV fields)
  phoneLat: number | null;
  phoneLng: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Unit conversion helpers
// ─────────────────────────────────────────────────────────────────────────────

function toMs(value: number, unit: string): number {
  switch (unit.toLowerCase()) {
    case 'km/h':
      return value / 3.6;
    case 'knots':
    case 'kts':
      return value * 0.514444;
    default: // 'm/s' or unknown
      return value;
  }
}

/**
 * Convert NMEA DDMM.MMMM (or DDDMM.MMMM) to decimal degrees.
 * Negative when hemisphere is S or W.
 */
function nmeaToDecimal(raw: string, hemi: string): number | null {
  const n = parseFloat(raw);
  if (isNaN(n)) return null;
  const deg = Math.floor(n / 100);
  const min = n - deg * 100;
  const decimal = deg + min / 60;
  return hemi === 'S' || hemi === 'W' ? -decimal : decimal;
}

function num(s: string): number | null {
  const v = parseFloat(s);
  return isNaN(v) ? null : v;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main parser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true when the dataSentence is the header row.
 * The header row uses the literal string "Unit" in the second position of each
 * triplet (e.g. "Wind speed,Unit,Description,...,Latitude phone,Longitude phone").
 */
export function isHeaderSentence(dataSentence: string): boolean {
  const parts = dataSentence.split(',');
  // Header: second field is literally "Unit"
  return parts.length >= 2 && parts[1].trim() === 'Unit';
}

/**
 * Parse a data-row dataSentence into structured sensor fields.
 * Returns null if the input is a header row (caller should set rowType = 'header').
 */
export function parseMeasureSentence(dataSentence: string): ParsedMeasure {
  const result: ParsedMeasure = {
    rowType: 'data',
    windSpeedMs: null,
    windSpeedKmh: null,
    windSpeedKnots: null,
    windSpeedRelMs: null,
    windSpeedTrueMs: null,
    windDirRelDeg: null,
    windDirTrueDeg: null,
    tempC: null,
    humidityPct: null,
    pressureHpa: null,
    precipMm: null,
    precipRateMmHr: null,
    solarWm2: null,
    voltageV: null,
    batteryVoltageV: null,
    currentA: null,
    dewPointC: null,
    qnhHpa: null,
    qfeHpa: null,
    gpsLat: null,
    gpsLng: null,
    gpsAltM: null,
    gpsSatellites: null,
    gpsHorDilution: null,
    gpsGeoidalSepM: null,
    gpsQuality: null,
    phoneLat: null,
    phoneLng: null,
  };

  if (isHeaderSentence(dataSentence)) {
    result.rowType = 'header';
    return result;
  }

  const parts = dataSentence.split(',');

  // Last two fields are always phone GPS (decimal degrees already)
  if (parts.length >= 2) {
    const lngStr = parts[parts.length - 1]?.trim();
    const latStr = parts[parts.length - 2]?.trim();
    const phoneLat = num(latStr ?? '');
    const phoneLng = num(lngStr ?? '');
    if (phoneLat !== null && phoneLng !== null) {
      result.phoneLat = phoneLat;
      result.phoneLng = phoneLng;
    }
  }

  // Remaining fields before phone GPS: process as triplets
  const tripletFields = parts.slice(0, parts.length - 2);

  // Track occurrence counters for fields that appear multiple times
  let precipCount = 0;
  let hpaCalcCount = 0; // counts hPa,Calculated occurrences (QFE=1st, QNH=2nd)
  let voltageCount = 0; // first V = solar/DC input, second V with 'BATT' = battery

  for (let i = 0; i + 2 < tripletFields.length; i += 3) {
    const rawVal = tripletFields[i]?.trim() ?? '';
    const unit = tripletFields[i + 1]?.trim() ?? '';
    const desc = tripletFields[i + 2]?.trim() ?? '';

    const unitLower = unit.toLowerCase();
    const descLower = desc.toLowerCase();

    // ── Wind speed (MWV) ────────────────────────────────────────────────────
    if (unitLower === 'm/s' || unitLower === 'km/h' || unitLower === 'knots') {
      const rawNum = num(rawVal);
      if (rawNum !== null) {
        const ms = toMs(rawNum, unit);
        const kmh = ms * 3.6;
        const knots = ms / 0.514444;

        if (descLower === 'relative') {
          result.windSpeedRelMs = ms;
        } else if (descLower === 'true') {
          result.windSpeedTrueMs = ms;
        }
        // Last parsed value also goes to the generic windSpeedMs field
        result.windSpeedMs = ms;
        result.windSpeedKmh = Math.round(kmh * 100) / 100;
        result.windSpeedKnots = Math.round(knots * 100) / 100;
      }
      continue;
    }

    // ── Wind direction (MWV) ────────────────────────────────────────────────
    if (unit === '°' && (descLower === 'relative' || descLower === 'true')) {
      const dir = num(rawVal);
      if (descLower === 'relative') result.windDirRelDeg = dir;
      else result.windDirTrueDeg = dir;
      continue;
    }

    // ── Temperature (XDR C or CAL Dew point) ────────────────────────────────
    if (unit === '°C') {
      const v = num(rawVal);
      if (descLower === 'calculated') {
        // Dew point (CAL)
        result.dewPointC = v;
      } else {
        // Temperature (XDR C, desc is transducer name like TEMP)
        result.tempC = v;
      }
      continue;
    }

    // ── Humidity (XDR H) ────────────────────────────────────────────────────
    if (unit === '%') {
      result.humidityPct = num(rawVal);
      continue;
    }

    // ── Pressure (XDR P, unit = 'B' = bar; 1 bar = 1000 hPa) ───────────────
    if (unitLower === 'b') {
      const v = num(rawVal);
      result.pressureHpa = v !== null ? Math.round(v * 1000 * 100) / 100 : null;
      continue;
    }

    // ── QFE / QNH (CAL, unit = hPa, desc = Calculated) ─────────────────────
    if (unitLower === 'hpa' && descLower === 'calculated') {
      hpaCalcCount++;
      const v = num(rawVal);
      if (hpaCalcCount === 1) result.qfeHpa = v;
      else result.qnhHpa = v;
      continue;
    }

    // ── Precipitation (XDR Y, unit = mm) ────────────────────────────────────
    if (unitLower === 'mm') {
      precipCount++;
      const v = num(rawVal);
      if (precipCount === 1) result.precipMm = v;         // total precipitation
      else result.precipRateMmHr = v;                      // intensity/rate (mm/hr)
      continue;
    }

    // ── Solar (XDR Z, unit = W/M² or W/m²) ─────────────────────────────────
    if (unitLower === 'w/m²' || unitLower === 'w/m2') {
      result.solarWm2 = num(rawVal);
      continue;
    }

    // ── Voltage (XDR V): BATTERY desc → batteryVoltageV; others → voltageV ──
    if (unitLower === 'v') {
      voltageCount++;
      const v = num(rawVal);
      if (descLower.includes('batt')) {
        result.batteryVoltageV = v;
      } else {
        // First non-battery V = solar/DC input
        if (result.voltageV === null) result.voltageV = v;
        else result.batteryVoltageV = v; // second V is battery if not labelled
      }
      continue;
    }

    // ── Current (XDR A) ─────────────────────────────────────────────────────
    if (unitLower === 'a' && desc !== 'LAT') {
      result.currentA = num(rawVal);
      continue;
    }

    // ── GPS Latitude (GGA field 2, desc = LAT) ───────────────────────────────
    if (desc === 'LAT') {
      // unit = N or S
      result.gpsLat = nmeaToDecimal(rawVal, unit);
      continue;
    }

    // ── GPS Longitude (GGA field 4, desc = LON) ──────────────────────────────
    if (desc === 'LON') {
      // unit = E or W
      result.gpsLng = nmeaToDecimal(rawVal, unit);
      continue;
    }

    // ── GPS Altitude (GGA field 9, desc = GEOID) ─────────────────────────────
    if (desc === 'GEOID') {
      result.gpsAltM = num(rawVal);
      continue;
    }

    // ── GPS Geoidal Separation (GGA field 11, desc = GEOIDAL) ────────────────
    if (desc === 'GEOIDAL') {
      result.gpsGeoidalSepM = num(rawVal);
      continue;
    }

    // ── GPS Satellites (GGA field 7, desc = NUM) ─────────────────────────────
    if (desc === 'NUM') {
      result.gpsSatellites = num(rawVal);
      continue;
    }

    // ── GPS Horizontal Dilution (GGA field 8, desc = DIL) ───────────────────
    if (desc === 'DIL') {
      result.gpsHorDilution = num(rawVal);
      continue;
    }

    // ── GPS Quality (GGA field 6, desc = Quality) ────────────────────────────
    if (desc === 'Quality') {
      result.gpsQuality = num(rawVal);
      continue;
    }

    // Unknown triplets are silently ignored — forward-compatible with new sensors.
  }

  return result;
}

/**
 * Parse a timeStamp string ("2026-05-01 14:32:01" or ISO) to Unix ms.
 * Falls back to Date.now() if parsing fails.
 */
export function parseTimestampMs(timeStamp: string): number {
  // Try ISO first, then space-separated date-time
  const ts = Date.parse(timeStamp.replace(' ', 'T'));
  return isNaN(ts) ? Date.now() : ts;
}
