import * as path from 'path';

/**
 * Where the standalone keeps everything it writes to disk — uploads today;
 * backups and logs in later phases.
 *
 * One root, configurable, so the Windows install can put it under
 * `C:\ProgramData\Observator\data` and a backup can take a single folder. In
 * development it defaults to `./data` beside the process.
 */
export function dataDir(): string {
  return path.resolve(process.env.STANDALONE_DATA_DIR || path.join(process.cwd(), 'data'));
}

export function uploadsDir(): string {
  return path.join(dataDir(), 'uploads');
}
