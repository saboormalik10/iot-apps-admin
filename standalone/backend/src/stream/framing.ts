/**
 * Bytes → lines, for the sensor's TCP stream.
 *
 * TCP delivers bytes, not lines. One packet can end halfway through a reading,
 * or carry several readings; nothing about a packet boundary means anything. So
 * bytes are buffered until a line terminator arrives, and only complete lines
 * are handed on.
 *
 * The GMX551 frames each reading as `<STX>payload<ETX>checksum<CR><LF>`. An STX
 * starts a new line whatever came before it: bytes in front of an STX are the
 * tail of a reading whose start was lost (the converter connected mid-line, or a
 * byte was dropped), and gluing them onto the next reading would corrupt it.
 * Unframed output — a unit configured without STX/ETX, or its header lines —
 * is split on CR/LF alone.
 *
 * The buffer is capped. A peer that never sends a terminator — a misconfigured
 * converter, or anything else that finds the open port — must not be able to
 * grow it until the process runs out of memory.
 */

export const STX = '\x02';
export const ETX = '\x03';

export interface FramerStats {
  /** Lines handed on. */
  lines: number;
  /** Times the buffer hit its cap and was discarded. */
  overflows: number;
  /** Partial lines thrown away because an STX started a new one. */
  fragments: number;
}

export class LineFramer {
  private buffer = '';
  readonly stats: FramerStats = { lines: 0, overflows: 0, fragments: 0 };

  constructor(private readonly maxLineBytes = 4096) {}

  /** Feed a chunk; get back every line it completed, oldest first. */
  push(chunk: Buffer | string): string[] {
    // latin1, not utf8: STX/ETX are single bytes, and a chunk boundary inside a
    // multi-byte utf8 sequence would otherwise decode as a replacement char. The
    // payload is plain ASCII, so nothing is lost.
    this.buffer += typeof chunk === 'string' ? chunk : chunk.toString('latin1');

    const out: string[] = [];
    let start = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      const c = this.buffer[i];
      if (c === STX && i > start) {
        // A reading began before the last one ended.
        if (this.buffer.slice(start, i).trim()) this.stats.fragments += 1;
        start = i;
      } else if (c === '\n' || c === '\r') {
        const line = this.buffer.slice(start, i);
        // Longer than any real reading: the line is noise, or two readings run
        // together with their terminator lost. Dropped HERE — the cap used to
        // apply only to what was left waiting for a terminator, so a line of any
        // length was passed on and counted as a reading.
        if (line.length > this.maxLineBytes) {
          this.stats.overflows += 1;
        } else if (line.trim()) {
          out.push(line);
        }
        start = i + 1;
      }
    }
    this.buffer = this.buffer.slice(start);

    if (this.buffer.length > this.maxLineBytes) {
      this.buffer = '';
      this.stats.overflows += 1;
    }
    this.stats.lines += out.length;
    return out;
  }

  /** What is waiting for a terminator — for a connection that closed mid-line. */
  get pending(): string {
    return this.buffer;
  }

  reset(): void {
    this.buffer = '';
  }
}
