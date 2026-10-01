/**
 * Every threshold number in the product, once.
 *
 * These figures appear on the corridor table, six chart reference lines, the rules
 * list, the rule drawer, the alert wording and the station cards. If any two of
 * those disagree the client stops trusting all of it — so nothing anywhere else may
 * hold a threshold literal: every screen imports its numbers from here.
 *
 * Values are from the Statement of Requirements as quoted in the proposal
 * (OBS-MTS-M1-WX-2026-01 §7, and Rev B §8). They are *configuration* in the real
 * system — MTS edits them on the rules screen — so this file is the seed, not the law.
 */

/** Vigilance windows, as numbers, so the prose below and the alert wording share them. */
const VIGILANCE_HOURS = { intensity: 6, short: 12, multiDay: 48 } as const;

export const THRESHOLDS = {
  rainfall: {
    /** ≥ 25 mm in 1 hour (rolling) → alert, 6-hour vigilance. */
    intensity: {
      value: 25,
      unit: 'mm/hr' as const,
      window: '1 hour (rolling)',
      vigilanceHours: VIGILANCE_HOURS.intensity,
      vigilance: `${VIGILANCE_HOURS.intensity} hours`,
    },
    /** ≥ 45 mm in 3 hours → alert, 12-hour vigilance. */
    short: {
      value: 45,
      unit: 'mm' as const,
      window: '3 hours (rolling)',
      vigilanceHours: VIGILANCE_HOURS.short,
      vigilance: `${VIGILANCE_HOURS.short} hours`,
    },
    /** ≥ 120 mm in 3 days → alert, 48-hour vigilance. */
    multiDay: {
      value: 120,
      unit: 'mm' as const,
      window: '3 days (rolling)',
      vigilanceHours: VIGILANCE_HOURS.multiDay,
      vigilance: `${VIGILANCE_HOURS.multiDay} hours`,
    },
  },
  flood: {
    /**
     * Level set points, in mm above the rail-foot datum.
     *
     * §7.3 names the states — standing water (PTZ verification), above rail foot
     * (block the line), trending down (staged reinstatement 25 → 60 kph →
     * unrestricted) — but puts the numbers in Annexure C, "per location". These
     * are the values the client's own figures draw: pump-start +100 and high-high
     * +180 on Figure 12, rail foot on Figure 8. All are pending MTS confirmation.
     */
    standingWaterMm: 80,
    /** Approaching standing water — a warning, and where fast reporting starts. */
    approachMm: 60,
    /**
     * §5.2: rate-of-rise alarming "independent of absolute threshold". A rise
     * this fast is a warning even while the level itself is still low.
     */
    rateOfRiseMmHr: 60,
    /** The level at which the duty pump starts (Fig 12). */
    pumpStartMm: 100,
    /** High-high alarm; the standby pump assists from here (Fig 12). */
    highHighMm: 180,
    /** Above the rail foot → block the line (Fig 8). */
    railFootMm: 200,
    /**
     * Where the pumps stop. Well below the start point on purpose: a stop level
     * close to the start level would hunt, starting and stopping the plant every
     * few minutes on a falling limb.
     */
    pumpStopMm: 60,
  },
  temperature: {
    /** ≥ 38 °C rising, held > 5 min → warning (60/40 kph TSR). */
    heat1: { value: 38, unit: '°C' as const, rising: '> 5 min', falling: '< 38 °C > 10 min' },
    /** ≥ 45 °C → alert. */
    heat2: { value: 45, unit: '°C' as const, rising: '> 5 min', falling: '< 45 °C > 10 min' },
  },
  wind: {
    /** ≥ 75 / ≥ 85 km/h at listed chainages → TSR wording. */
    gustWarn: { value: 75, unit: 'km/h' as const },
    gustAlert: { value: 85, unit: 'km/h' as const },
    /** ≥ 120 km/h on external (non-tunnel) track → block the line. */
    extreme: { value: 120, unit: 'km/h' as const },
  },
  power: {
    /** Leading indicator, not a weather rule: low battery raises a system fault. */
    lowBatteryPct: 40,
  },
  /** A station silent this long is itself an alert condition. */
  silenceMinutes: 15,
  /**
   * The obligations the alerts are measured against (§7.1): a weather alert
   * reaches its recipients within 5 minutes of the breach, a system fault within
   * 30. Shown on screen so the promise is visible, not just contractual.
   */
  deliveryMinutes: { weather: 5, systemFault: 30 },
} as const;

/**
 * How each threshold is written on screen. Kept beside the values so a label can
 * never drift from the number it describes.
 */
export const THRESHOLD_LABELS = {
  rainIntensity: `≥ ${THRESHOLDS.rainfall.intensity.value} mm/hr`,
  rainIntensityFull: `Threshold ≥ ${THRESHOLDS.rainfall.intensity.value} mm/hr (1 h)`,
  rainShort: `≥ ${THRESHOLDS.rainfall.short.value} mm / 3 h`,
  rainMultiDay: `≥ ${THRESHOLDS.rainfall.multiDay.value} mm / 3 days`,
  windGust: `≥ ${THRESHOLDS.wind.gustWarn.value} km/h`,
  windGustPair: `≥ ${THRESHOLDS.wind.gustWarn.value} / ≥ ${THRESHOLDS.wind.gustAlert.value} km/h`,
  windExtreme: `≥ ${THRESHOLDS.wind.extreme.value} km/h`,
  tempHeat1: `≥ ${THRESHOLDS.temperature.heat1.value} °C`,
  tempHeat2: `≥ ${THRESHOLDS.temperature.heat2.value} °C`,
  pumpStart: `pump-start +${THRESHOLDS.flood.pumpStartMm} mm`,
  highHigh: `high-high +${THRESHOLDS.flood.highHighMm} mm`,
  railFoot: `rail foot ${THRESHOLDS.flood.railFootMm} mm (block line)`,
  levelFull: `Pump-start +${THRESHOLDS.flood.pumpStartMm} mm · high-high +${THRESHOLDS.flood.highHighMm} mm`,
} as const;

/** The column headings on the corridor status table quote their thresholds. */
export const STATUS_COLUMNS = {
  rain: `Rain (${THRESHOLD_LABELS.rainIntensity})`,
  wind: `Wind (${THRESHOLD_LABELS.windGust})`,
  temp: `Temp (${THRESHOLD_LABELS.tempHeat1})`,
} as const;
