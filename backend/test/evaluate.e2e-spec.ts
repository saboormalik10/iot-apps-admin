import { evaluate } from '../src/alert-rules/evaluate';

/**
 * Pure unit test for the alert threshold comparator (no DB/app needed). Runs
 * under the same jest-e2e config via the `.e2e-spec.ts` suffix.
 */
describe('alert evaluate() comparator (unit)', () => {
  it('gt', () => {
    expect(evaluate('gt', 5, 3)).toBe(true);
    expect(evaluate('gt', 3, 3)).toBe(false);
    expect(evaluate('gt', 2, 3)).toBe(false);
  });
  it('gte', () => {
    expect(evaluate('gte', 3, 3)).toBe(true);
    expect(evaluate('gte', 4, 3)).toBe(true);
    expect(evaluate('gte', 2, 3)).toBe(false);
  });
  it('lt', () => {
    expect(evaluate('lt', 2, 3)).toBe(true);
    expect(evaluate('lt', 3, 3)).toBe(false);
  });
  it('lte', () => {
    expect(evaluate('lte', 3, 3)).toBe(true);
    expect(evaluate('lte', 4, 3)).toBe(false);
  });
});
