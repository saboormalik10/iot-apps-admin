import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * The backend and the provisioning agent must agree on the JOB TYPES.
 *
 * The existing cross-layer test pins the account and folder name rules across
 * the two. Job types were never pinned, and the failure is quiet: the backend
 * queues a type the agent does not know, `vetJob` refuses it, the job is retried
 * to the attempt ceiling and then sits as `failed`. Nothing surfaces until
 * somebody notices a station that never came up.
 *
 * The agent is a separate package with its own build, so the list is read from
 * its source rather than imported — a stale compiled copy would defeat the point.
 */

const AGENT_SAFETY = join(__dirname, '..', '..', 'provision-agent', 'src', 'safety.ts');

const parseList = (text: string, marker: string): string[] => {
  const start = text.indexOf(marker);
  if (start === -1) throw new Error(`marker not found: ${marker}`);
  const open = text.indexOf('[', start);
  const close = text.indexOf(']', open);
  const slice = text
    .slice(open, close)
    .split('\n')
    // Comments first: an apostrophe in prose ("the customer's env file") is
    // otherwise matched as a quoted value and the diff becomes unreadable.
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
  return [...slice.matchAll(/'([A-Za-z][A-Za-z0-9]*)'/g)].map((m) => m[1]).sort();
};

describe('backend and agent agree on provisioning job types', () => {
  // Skipped rather than failed when the agent is not checked out beside the
  // backend — CI for one package should not fail on the other's absence.
  const available = existsSync(AGENT_SAFETY);
  (available ? it : it.skip)('every type the backend can queue is one the agent knows', () => {
    const backend = parseList(
      readFileSync(join(__dirname, '..', 'src', 'models', 'ProvisioningJob.ts'), 'utf8'),
      'const provisioningJobSchema',
    );
    const agent = parseList(readFileSync(AGENT_SAFETY, 'utf8'), 'KNOWN_JOB_TYPES');

    expect(backend.length).toBeGreaterThan(0);
    expect(agent.length).toBeGreaterThan(0);

    // Backend-only → the job queues and then fails at the agent forever.
    expect(backend.filter((t) => !agent.includes(t))).toEqual([]);
    // Agent-only → dead code on a box running as root, which is worth knowing.
    expect(agent.filter((t) => !backend.includes(t))).toEqual([]);
  });
});
