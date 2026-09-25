import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, fireEvent, waitFor } from './utils';

/**
 * The query screen (client, 21 Sep 2026): choose the parameters, see them in a
 * table, download them as CSV. The CSV link must carry exactly the query the
 * table shows — the server builds both from one path.
 */
vi.mock('@/features/dashboard/use-scoped-device', () => ({
  useScopedDevice: () => ({ deviceId: 'st-1', isLoading: false, isError: false, isAuto: true, candidates: [], refetch: () => {} }),
}));
vi.mock('@/lib/rbac/guard', () => ({ Can: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

const getQueryColumns = vi.fn();
const runQuery = vi.fn();
vi.mock('@/lib/api/endpoints', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/endpoints')>()),
  getQueryColumns: (...a: unknown[]) => getQueryColumns(...a),
  runQuery: (...a: unknown[]) => runQuery(...a),
}));

import { QueryPage } from '@/features/query/query-page';

const COLUMNS = {
  timezone: 'Australia/Melbourne',
  rainDayStartHour: 9,
  resolutions: ['minute', 'hour', 'day'],
  columns: [
    { key: 'windSpeed', label: 'Wind speed', unit: 'm/s', minuteOnly: false },
    { key: 'windDir', label: 'Wind direction', unit: '°', minuteOnly: false },
    { key: 'windSpeed10m', label: 'Wind speed, 10-min mean', unit: 'm/s', minuteOnly: true },
    { key: 'temperature', label: 'Temperature', unit: '°C', minuteOnly: false },
    { key: 'rain', label: 'Rain', unit: 'mm', minuteOnly: false },
    { key: 'coverage', label: 'Readings', unit: '', minuteOnly: false },
  ],
};

const RESULT = {
  columns: [
    { key: 'windSpeed', label: 'Wind speed', unit: 'm/s' },
    { key: 'rain', label: 'Rain', unit: 'mm' },
  ],
  rows: [
    { t: Date.parse('2026-09-01T07:00:00+10:00'), windSpeed: 5.12, rain: 0 },
    { t: Date.parse('2026-09-01T08:00:00+10:00'), windSpeed: 10, rain: 1 },
  ],
  total: 2,
  page: 1,
  limit: 100,
  pageCount: 1,
  resolution: 'hour',
  timezone: 'Australia/Melbourne',
  rainDayStartHour: 9,
};

describe('QueryPage', () => {
  beforeEach(() => {
    getQueryColumns.mockReset().mockResolvedValue(COLUMNS);
    runQuery.mockReset().mockResolvedValue(RESULT);
  });

  const checkbox = (name: RegExp) => screen.getByRole('checkbox', { name }) as HTMLInputElement;

  it('ticks the headline columns and disables minute-only ones for hourly rows', async () => {
    renderWithProviders(<QueryPage />);
    await waitFor(() => expect(checkbox(/^Wind speed \(m\/s\)$/).checked).toBe(true));
    expect(checkbox(/^Rain/).checked).toBe(true);
    expect(checkbox(/^Readings/).checked).toBe(false);
    // Hourly by default: a 10-minute mean of an hour means nothing.
    expect(checkbox(/10-min mean/).disabled).toBe(true);
    expect(screen.getByText('One-minute rows only')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Every minute' }));
    expect(checkbox(/10-min mean/).disabled).toBe(false);
  });

  it('reads the period in the STATION’s time and shows the rows', async () => {
    renderWithProviders(<QueryPage />);
    await waitFor(() => expect(checkbox(/^Wind speed \(m\/s\)$/).checked).toBe(true));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-01T07:00' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-01T11:00' } });
    fireEvent.click(screen.getByRole('button', { name: /show/i }));

    await waitFor(() => expect(runQuery).toHaveBeenCalled());
    const params = runQuery.mock.calls[0][0];
    // 07:00 in Melbourne is 21:00 UTC the day before, whatever zone this test runs in.
    expect(params).toMatchObject({
      deviceId: 'st-1',
      from: Date.parse('2026-08-31T21:00:00Z'),
      to: Date.parse('2026-09-01T01:00:00Z'),
      resolution: 'hour',
      page: 1,
    });
    // In the catalogue's order, whatever order they were ticked in.
    expect(params.fields).toEqual(['windSpeed', 'windDir', 'temperature', 'rain']);

    expect(await screen.findByText('Wind speed (m/s)')).toBeInTheDocument();
    expect(screen.getByText('5.12')).toBeInTheDocument();
    expect(screen.getByText(/^2 rows/)).toBeInTheDocument();
  });

  it('arms the CSV download with exactly the shown query', async () => {
    renderWithProviders(<QueryPage />);
    await waitFor(() => expect(checkbox(/^Wind speed \(m\/s\)$/).checked).toBe(true));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-01T07:00' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-01T11:00' } });
    fireEvent.click(screen.getByRole('button', { name: /show/i }));

    const link = (await screen.findByRole('link', { name: /download csv/i })) as HTMLAnchorElement;
    const url = new URL(link.getAttribute('href')!, 'http://portal');
    expect(url.pathname).toBe('/api/query/measures.csv');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      deviceId: 'st-1',
      from: String(Date.parse('2026-08-31T21:00:00Z')),
      to: String(Date.parse('2026-09-01T01:00:00Z')),
      fields: 'windSpeed,windDir,temperature,rain',
      resolution: 'hour',
    });
  });

  it('will not run a period that ends before it starts', async () => {
    renderWithProviders(<QueryPage />);
    await waitFor(() => expect(checkbox(/^Wind speed \(m\/s\)$/).checked).toBe(true));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-02T07:00' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-01T07:00' } });
    expect(screen.getByRole('button', { name: /show/i })).toBeDisabled();
    expect(screen.getByText('The end must be after the start.')).toBeInTheDocument();
  });
});
