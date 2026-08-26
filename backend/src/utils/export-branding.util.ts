import { Organization } from '../models/Organization';

/**
 * The customer's name, for files that leave the platform.
 *
 * An exported CSV is the one artefact that outlives the session and gets emailed
 * around. Without this it is called `MET-Link-2026-08-25.csv` and carries no
 * indication of whose data it holds — which, once several customers are on the
 * platform, is how one customer's readings end up quoted in another's report.
 */
export async function exportLabel(organizationId: string): Promise<string> {
  const org = await Organization.findById(organizationId).select('name branding.displayName').lean();
  return (org?.branding?.displayName?.trim() || org?.name || '').trim();
}

/**
 * `Acme Marine Services` → `Acme-Marine-Services`, safe in a filename on any OS.
 *
 * Returns '' when nothing survives sanitising, so the caller falls back to its
 * plain name rather than producing `--2026-08-25.csv`.
 */
export function filenameSafe(label: string): string {
  return label
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 48);
}

/** `MET-Link` + customer + date → `Acme-Marine-MET-Link-2026-08-25.csv`. */
export function brandedFilename(label: string, base: string, ext: string): string {
  const prefix = filenameSafe(label);
  return `${prefix ? `${prefix}-` : ''}${base}.${ext}`;
}

/**
 * A provenance comment for the top of a CSV.
 *
 * `#` is not part of RFC 4180, but every tool that matters (Excel, Pandas,
 * R) skips or ignores a leading comment line, and the alternative — a second
 * header row — actively breaks parsers.
 */
export function csvProvenance(label: string, generatedAt = new Date()): string {
  // Newlines collapsed: a display name is length-capped but not newline-free,
  // and one embedded here would push the real header row down a line and break
  // every parser reading the file.
  const oneLine = label.replace(/[\r\n]+/g, ' ').trim();
  return `# ${oneLine} — exported ${generatedAt.toISOString()}`;
}
