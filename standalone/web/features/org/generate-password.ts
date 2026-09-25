/**
 * A password to hand to someone: 12 characters from a CSPRNG, without look-alikes
 * (no 0/O, 1/l/I), since it is read out or written down. Shown to the operator
 * only; never sent to the server as a "suggestion".
 */
export function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
