import { describe, it, expect } from 'vitest';
import { normalizePage, fullArrayPage } from '@/lib/api/pagination';

describe('pagination normalizer', () => {
  it('maps totalPages → pageCount and passes rows through', () => {
    const page = normalizePage<{ id: number }>({
      data: [{ id: 1 }, { id: 2 }],
      pagination: { page: 2, limit: 20, total: 45, totalPages: 3 },
    });
    expect(page.rows).toHaveLength(2);
    expect(page.page).toBe(2);
    expect(page.total).toBe(45);
    expect(page.pageCount).toBe(3);
  });

  it('computes pageCount from total/limit when totalPages is absent', () => {
    const page = normalizePage<number>({ data: [], pagination: { page: 1, limit: 10, total: 25 } });
    expect(page.pageCount).toBe(3);
  });

  it('handles a null/empty envelope', () => {
    const page = normalizePage(null);
    expect(page.rows).toEqual([]);
    expect(page.pageCount).toBe(1);
  });

  it('fullArrayPage wraps an unpaginated array', () => {
    const page = fullArrayPage([1, 2, 3]);
    expect(page).toMatchObject({ total: 3, page: 1, pageCount: 1 });
  });
});
