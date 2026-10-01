/** Types for the palette validator (lib/viz/checks.mjs), shared by the app and `yarn validate-palette`. */
export type CheckState = boolean | 'pass' | 'floor' | 'relief' | 'fail';
export interface CheckResult {
  ok: boolean;
  report: [name: string, state: CheckState, detail: string][];
}
export function validate(
  palette: string[],
  opts?: { mode?: 'light' | 'dark'; surface?: string; pairs?: 'adjacent' | 'all' },
): CheckResult;
export function validateOrdinal(palette: string[], opts?: { mode?: 'light' | 'dark'; surface?: string }): CheckResult;
export function contrast(a: string, b: string): number;
