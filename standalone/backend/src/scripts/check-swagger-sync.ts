import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../app.module';

/**
 * Verifies the Swagger/OpenAPI spec still matches the code, and fails loudly when
 * it drifts. Documentation rots silently — a `@Query()` added without its
 * `@ApiQuery` is invisible to the mobile devs reading /api, and nothing else
 * catches it.
 *
 *   npm run check:swagger
 *
 * Checks:
 *   A. every query parameter carries a human-readable `description`
 *   B. no `@ApiQuery` documents a param the handler never reads (stale doc)
 *   C. every operation documents a success response (2xx)
 *   D. every write endpoint with a body has a typed schema, not a bare object
 *
 * Note on (A): Nest INFERS a spec parameter from `@Query('x')` on its own, so a
 * missing `@ApiQuery` never leaves a param out of the spec — it leaves it in the
 * spec with no explanation, which is the failure a mobile dev actually hits.
 * Presence is therefore not worth checking; a description is.
 */

/** Routes served outside the /v1 global prefix (see main.ts `exclude`). */
const PREFIX_EXEMPT = new Set(['/health', '/version']);

interface Finding {
  check: string;
  route: string;
  detail: string;
}

/** route+verb → the query params the handler actually reads. */
function queryParamsFromSource(root: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? walk(p) : p.endsWith('.controller.ts') ? [p] : [];
    });

  for (const file of walk(root)) {
    const src = fs.readFileSync(file, 'utf8');
    const base = /@Controller\('([^']*)'\)/.exec(src)?.[1] ?? '';
    const blocks = src.split(/\n  @(?=Get\(|Post\(|Patch\(|Put\(|Delete\()/);
    for (let i = 1; i < blocks.length; i++) {
      const m = /^(Get|Post|Patch|Put|Delete)\(([^)]*)\)/.exec(blocks[i]);
      if (!m) continue;
      const route = m[2].trim().replace(/['"]/g, '');
      const handler = blocks[i].split('\n  }')[0];
      const full =
        ('/v1/' + [base, route].filter(Boolean).join('/')).replace(/:(\w+)/g, '{$1}').replace(/\/$/, '');
      const params = new Set([...handler.matchAll(/@Query\('([^']+)'\)/g)].map((x) => x[1]));
      out.set(`${m[1].toLowerCase()} ${full}`, params);
    }
  }
  return out;
}

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('v1', { exclude: ['health', 'version'] });
  const cfg = new DocumentBuilder().setTitle('sync-check').setVersion('1').addBearerAuth().build();
  const doc = SwaggerModule.createDocument(app, cfg);
  await app.close();

  const truth = queryParamsFromSource(path.join(__dirname, '..'));
  const findings: Finding[] = [];
  let operations = 0;

  for (const [route, ops] of Object.entries(doc.paths)) {
    for (const [verb, op] of Object.entries(ops as Record<string, Record<string, unknown>>)) {
      operations++;
      const key = `${verb} ${route}`;
      const label = `${verb.toUpperCase()} ${route}`;

      const params = (op.parameters ?? []) as Array<{ name: string; in: string; description?: string }>;
      const query = params.filter((p) => p.in === 'query');
      for (const p of query) {
        if (!p.description?.trim()) findings.push({ check: 'A', route: label, detail: `query "${p.name}" has no description` });
      }
      const actual = truth.get(key);
      if (actual) {
        for (const p of query) {
          if (!actual.has(p.name)) findings.push({ check: 'B', route: label, detail: `query "${p.name}" is documented but never read` });
        }
      } else if (!route.includes('{') && !PREFIX_EXEMPT.has(route)) {
        findings.push({ check: 'B', route: label, detail: 'could not match this operation back to a controller handler' });
      }

      const codes = Object.keys((op.responses ?? {}) as object);
      if (!codes.some((c) => c.startsWith('2'))) findings.push({ check: 'C', route: label, detail: 'no success (2xx) response documented' });

      const body = op.requestBody as { content?: Record<string, { schema?: Record<string, unknown> }> } | undefined;
      const schema = body?.content?.['application/json']?.schema ?? body?.content?.['multipart/form-data']?.schema;
      if (schema && !schema.$ref && schema.type === 'object' && !schema.properties) {
        findings.push({ check: 'D', route: label, detail: 'request body is an untyped object — bind a DTO class' });
      }
    }
  }

  console.log(`Checked ${operations} operations across ${Object.keys(doc.paths).length} paths.`);
  if (!findings.length) {
    console.log('✅ Swagger is in sync with the code.');
    return;
  }
  console.error(`\n❌ ${findings.length} drift issue(s):\n`);
  for (const f of findings) console.error(`  [${f.check}] ${f.route}\n        ${f.detail}`);
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
