/**
 * Runs every 3-day rain scenario through the engine and checks the result against
 * the hand-calculated expectations.   yarn test:rain
 * With --export <dir>, also writes the test data: per scenario, every gauge tip, an
 * hourly summary (rain in the hour, 3-day total, state) and the expected events.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOUR, THREE_DAY_RULE, runRainRule } from '../lib/rain-sim/engine';
import { expectedCsv, fileBase, hourlyCsv, tipsCsv } from '../lib/rain-sim/export';
import {
  EVENT_LABEL,
  SCENARIOS,
  SCENARIO_START,
  checkRun,
  tipsFor,
} from '../lib/rain-sim/scenarios';

const exportIdx = process.argv.indexOf('--export');
const outDir = exportIdx > 0 ? process.argv[exportIdx + 1] : undefined;
if (outDir) mkdirSync(outDir, { recursive: true });

let failed = 0;
for (const s of SCENARIOS) {
  const tips = tipsFor(s);
  const run = runRainRule(tips, THREE_DAY_RULE, SCENARIO_START, SCENARIO_START + s.runH * HOUR);
  const { rows, pass } = checkRun(s.expected, run.events);
  if (!pass) failed++;
  const total = Math.round(tips.reduce((a, x) => a + x.mm, 0) * 10) / 10;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${s.id}  ${s.title}  (${tips.length} tips, ${total} mm)`);
  for (const r of rows) {
    console.log(
      `        ${r.pass ? 'ok  ' : 'BAD '} ${EVENT_LABEL[r.kind].padEnd(18)} expected ${(r.expectedAt ?? '—').padStart(6)}   actual ${(r.actualAt ?? '—').padStart(6)}`,
    );
  }
  if (!rows.length) console.log('        ok   no events, as expected');

  if (outDir) {
    writeFileSync(join(outDir, `${fileBase(s)}-tips.csv`), tipsCsv(s));
    writeFileSync(join(outDir, `${fileBase(s)}-hourly.csv`), hourlyCsv(s));
    writeFileSync(join(outDir, `${fileBase(s)}-expected.csv`), expectedCsv(s));
  }
}

console.log(
  failed ? `\n${failed} scenario(s) failed` : `\nAll ${SCENARIOS.length} scenarios passed`,
);
process.exit(failed ? 1 : 0);
