import {
  vectorMeanDirectionDeg,
  peakGust,
  meanWind,
  WMO_GUST_WINDOW_MS,
  WMO_MEAN_WINDOW_MS,
} from '../src/analytics/wmo';

/**
 * The calculations WMO-No. 8 defines, checked against the cases that expose a
 * wrong implementation. The client asked directly whether we follow the guide.
 */

const s = (timestampMs: number, speedMs: number | null, dirDeg?: number | null) => ({
  timestampMs,
  speedMs,
  dirDeg,
});

describe('vector mean direction (WMO)', () => {
  it('does NOT average 350° and 10° to due south', () => {
    /**
     * The whole reason the vector method exists. Both bearings are nearly north;
     * the arithmetic mean is 180°, which points the opposite way — and looks
     * entirely plausible on a chart.
     */
    expect(vectorMeanDirectionDeg([350, 10])).toBe(0);
    expect((350 + 10) / 2).toBe(180); // what the naive version would give
  });

  it('averages ordinary bearings the way you would expect', () => {
    expect(vectorMeanDirectionDeg([90, 90, 90])).toBe(90);
    expect(vectorMeanDirectionDeg([80, 100])).toBe(90);
  });

  it('crosses north from either side', () => {
    expect(vectorMeanDirectionDeg([340, 20])).toBe(0);
    expect(vectorMeanDirectionDeg([355, 5, 0])).toBe(0);
  });

  it('returns null when the directions cancel, rather than inventing north', () => {
    // Opposed pairs have no mean direction. Reporting 0° would be a northerly
    // that was never measured.
    expect(vectorMeanDirectionDeg([0, 180])).toBeNull();
    expect(vectorMeanDirectionDeg([0, 90, 180, 270])).toBeNull();
  });

  it('ignores gaps rather than treating them as zero', () => {
    expect(vectorMeanDirectionDeg([90, null, 90])).toBe(90);
    expect(vectorMeanDirectionDeg([null, null])).toBeNull();
    expect(vectorMeanDirectionDeg([])).toBeNull();
  });
});

describe('gust as the peak 3-second mean (WMO)', () => {
  it('is the 3-second window constant', () => {
    expect(WMO_GUST_WINDOW_MS).toBe(3_000);
  });

  it('reports the peak MEAN, not the peak single reading', () => {
    // One noisy sample among calm ones. The old definition returned 20; the
    // WMO one averages it across three seconds.
    const out = peakGust([s(0, 2), s(1000, 2), s(2000, 20), s(3000, 2), s(4000, 2)]);
    expect(out!.gustMs).toBeLessThan(20);
    expect(out!.gustMs).toBe(8); // (2 + 2 + 20) / 3
  });

  it('finds a sustained gust over a brief spike', () => {
    const spike = [s(0, 1), s(1000, 1), s(2000, 15), s(3000, 1)];
    const sustained = [s(0, 1), s(1000, 9), s(2000, 10), s(3000, 11)];
    expect(peakGust(spike)!.gustMs).toBeLessThan(peakGust(sustained)!.gustMs);
  });

  it('uses a TIME window, not a sample count', () => {
    /**
     * The logger is nominally 1 Hz and not exactly — a real minute arrives at
     * :00, :02, :03, :04. "The last three documents" would silently become a
     * 4-second window whenever a second is skipped.
     */
    const out = peakGust([s(0, 10), s(4000, 10), s(8000, 10)]);
    // Each sample is alone in its own 3-second window, so the mean is the value.
    expect(out!.gustMs).toBe(10);
  });

  it('gives the direction at the gust, vector-averaged over the same window', () => {
    // Rising speed, so the full 3-second window is unambiguously the peak —
    // with equal speeds every window ties and the earliest wins, which would
    // test the tie rule instead of the direction.
    const out = peakGust([s(0, 1, 350), s(1000, 5, 10), s(2000, 9, 0)]);
    expect(out!.gustMs).toBe(5); // (1 + 5 + 9) / 3
    expect(out!.dirDeg).toBe(0); // vector mean of 350, 10, 0 — not 120
  });

  it('ignores missing speeds and handles an empty set', () => {
    expect(peakGust([s(0, null), s(1000, 4)])!.gustMs).toBe(4);
    expect(peakGust([])).toBeNull();
    expect(peakGust([s(0, null)])).toBeNull();
  });

  it('keeps the EARLIEST window on a tie, so reruns agree', () => {
    // Constant wind: every window has the same mean. Resolving ties by "first
    // seen" makes the answer stable; "last seen" would move the reported gust
    // time every time the query window shifted by a second.
    const out = peakGust([s(0, 5), s(1000, 5), s(2000, 5), s(3000, 5)]);
    expect(out!.gustMs).toBe(5);
    expect(out!.atMs).toBe(0);
  });
});

describe('10-minute mean wind (WMO)', () => {
  it('is the 10-minute window constant', () => {
    expect(WMO_MEAN_WINDOW_MS).toBe(600_000);
  });

  it('averages speed arithmetically and direction as vectors', () => {
    const out = meanWind([s(0, 4, 350), s(1000, 6, 10)]);
    expect(out.speedMs).toBe(5);
    expect(out.dirDeg).toBe(0); // not 180
    expect(out.samples).toBe(2);
  });

  it('reports how many samples it used', () => {
    // A "10-minute mean" from three readings is not one, and the caller needs
    // to be able to tell.
    expect(meanWind([s(0, 1), s(1, null), s(2, 3)]).samples).toBe(2);
  });

  it('survives a window with nothing in it', () => {
    expect(meanWind([])).toEqual({ speedMs: null, dirDeg: null, samples: 0 });
  });
});
