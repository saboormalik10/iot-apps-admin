/**
 * Validation for anything that becomes a Unix account or a directory.
 *
 * THIS IS THE SECURITY BOUNDARY. Provisioning is remote code execution by
 * design: a value that reaches `useradd` unvalidated is a shell injection with
 * root behind it. The rule is a strict allow-list — never an escape, never a
 * deny-list — and it is applied in all three layers (API, queue, agent) so no
 * single mistake is sufficient.
 */

/**
 * `wx-acme-01`. Lowercase, starts with a letter, 3–32 characters.
 *
 * Deliberately NARROWER than Linux allows: no dots (which confuse `chown a.b`),
 * no trailing `$` (Samba machine accounts), no uppercase (case-insensitive
 * filesystems make `Acme` and `acme` collide).
 */
export const ACCOUNT_RE = /^[a-z][a-z0-9_-]{2,31}$/;

/** Reserved names that must never be issued to a station. */
const RESERVED = new Set([
  'root', 'daemon', 'bin', 'sys', 'sync', 'games', 'man', 'lp', 'mail', 'news',
  'uucp', 'proxy', 'www-data', 'backup', 'list', 'irc', 'gnats', 'nobody',
  'systemd', 'sshd', 'ubuntu', 'admin', 'administrator', 'ftp', 'sftp',
  'observator', 'wxstation',
]);

export function isValidAccountName(name: string): boolean {
  if (!ACCOUNT_RE.test(name)) return false;
  if (RESERVED.has(name)) return false;
  return true;
}

export function assertValidAccountName(name: string): void {
  if (!ACCOUNT_RE.test(name)) {
    throw Object.assign(
      new Error('An account name must be 3–32 characters, lowercase, starting with a letter (a–z, 0–9, - and _).'),
      { statusCode: 400, code: 'INVALID_ACCOUNT_NAME' },
    );
  }
  if (RESERVED.has(name)) {
    throw Object.assign(new Error(`"${name}" is reserved and cannot be used for a station account.`), {
      statusCode: 400,
      code: 'RESERVED_ACCOUNT_NAME',
    });
  }
}

/**
 * A single folder segment under the upload root, e.g. `Demo Tower`.
 *
 * Wider than an account name because it is a display-facing directory the
 * client types into their logger — spaces and capitals are expected. Still an
 * allow-list, and still no separators, `..`, or leading dot.
 */
export const FOLDER_SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}$/;

export function isValidFolderSegment(segment: string): boolean {
  if (!FOLDER_SEGMENT_RE.test(segment)) return false;
  if (segment.includes('..')) return false;
  if (segment.trim() !== segment) return false;
  return true;
}

export function assertValidFolderSegment(segment: string): void {
  if (!isValidFolderSegment(segment)) {
    throw Object.assign(
      new Error('A folder name may contain letters, digits, spaces, dots, hyphens and underscores only.'),
      { statusCode: 400, code: 'INVALID_FOLDER_NAME' },
    );
  }
}
