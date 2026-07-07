/**
 * Pagination envelope normalizer (plan §10.3). The backend returns lists as
 * `{ data: [...], pagination: { page, limit, total, totalPages } }` (audit,
 * notifications). We normalize to a single stable shape the tables consume, so
 * a backend field rename is absorbed in exactly one place.
 */
export interface Page<T> {
  rows: T[];
  page: number;
  limit: number;
  total: number;
  pageCount: number;
}

interface RawPagination {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  pageCount?: number;
}

interface RawListEnvelope<T> {
  data?: T[];
  pagination?: RawPagination;
}

export function normalizePage<T>(body: RawListEnvelope<T> | undefined | null): Page<T> {
  const rows = body?.data ?? [];
  const p = body?.pagination ?? {};
  const page = p.page ?? 1;
  const limit = p.limit ?? rows.length;
  const total = p.total ?? rows.length;
  const pageCount = p.pageCount ?? p.totalPages ?? (limit > 0 ? Math.ceil(total / limit) : 1);
  return { rows, page, limit, total, pageCount };
}

/** For endpoints that return the full array unpaginated (e.g. org users). */
export function fullArrayPage<T>(rows: T[]): Page<T> {
  return { rows, page: 1, limit: rows.length, total: rows.length, pageCount: 1 };
}
