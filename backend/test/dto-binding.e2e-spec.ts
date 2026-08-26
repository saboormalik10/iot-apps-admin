import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Policy test — reads SOURCE, needs no database.
 *
 * `ValidationPipe` validates against the parameter's runtime METATYPE. TypeScript
 * interfaces, type aliases and inline object literals all erase at compile time,
 * so a body bound to one of them has no metatype and is passed through
 * **completely unvalidated** — while looking, in review and in Swagger, exactly
 * like a validated endpoint.
 *
 * This has now caused three separate defects in this codebase:
 *   • M19 — `SwitchOrgDto` had no validators, so `whitelist: true` stripped every
 *     field and `POST /auth/switch-org` returned 200 and did nothing.
 *   • M24 W1 — `POST /auth/login` bound the `LoginInput` interface. Sending
 *     `{"email":{"$ne":null}}` reached `input.email.toLowerCase()` and returned a
 *     500 that leaked the internal message to an unauthenticated caller.
 *   • M24 W1 — `POST /records` and the dashboard-layout routes bound interfaces
 *     and an inline object literal, persisting caller-shaped data.
 *
 * So: every `@Body()` must bind a CLASS that carries at least one class-validator
 * decorator. A Swagger-only DTO is not validation.
 */
describe('request body binding', () => {
  const root = join(__dirname, '..', 'src');

  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.controller.ts') ? [join(dir, e.name)] : [],
    );

  /**
   * Deliberate exceptions, each with a reason. An entry here is a claim that the
   * route validates by some other means — not that validation does not matter.
   */
  const ALLOWED_UNTYPED = new Map<string, string>([
    [
      'devices/devices.controller.ts',
      'PATCH :id/settings takes an open key/value bag, but devices.service copies ' +
        'only keys present in the SETTINGS_FIELDS allowlist, so unknown keys are ' +
        'dropped rather than written.',
    ],
  ]);

  const VALIDATOR = /@(Is[A-Z]\w*|Min|Max|MinLength|MaxLength|Length|Matches|ValidateNested|ArrayM\w+|Allow|Type)\b/;

  // Every `export class X { ... }` in src, with its body, so a bound type can be
  // resolved back to a real class regardless of which file declares it.
  const classes = new Map<string, string>();
  const collect = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) collect(full);
      else if (e.name.endsWith('.ts')) {
        const src = readFileSync(full, 'utf8');
        for (const m of src.matchAll(/export class (\w+)\s*(?:extends [^{]+)?\{/g)) {
          const rest = src.slice(m.index! + m[0].length);
          const nxt = rest.indexOf('\nexport ');
          classes.set(m[1], rest.slice(0, nxt === -1 ? undefined : nxt));
        }
      }
    }
  };

  beforeAll(() => collect(root));

  it('binds every @Body() to a class that validates', () => {
    const problems: string[] = [];

    for (const file of walk(root)) {
      const rel = file.replace(`${root}/`, '');
      const lines = readFileSync(file, 'utf8').split('\n');

      lines.forEach((raw) => {
        const line = raw.trim();
        if (line.startsWith('//') || line.startsWith('*') || !line.includes('@Body()')) return;

        const m = line.match(/@Body\(\)\s+\w+:\s*([^,)]+)/);
        if (!m) return;
        const type = m[1].trim();

        if (ALLOWED_UNTYPED.has(rel)) return;

        // An inline object literal never has a metatype.
        if (type.startsWith('{')) {
          problems.push(`${rel}: @Body() bound to an inline object literal — erases at runtime`);
          return;
        }

        const body = classes.get(type);
        if (body === undefined) {
          problems.push(`${rel}: @Body() bound to '${type}', which is not an exported class`);
          return;
        }
        if (!VALIDATOR.test(body)) {
          problems.push(`${rel}: '${type}' is a class but declares no class-validator decorators`);
        }
      });
    }

    expect(problems).toEqual([]);
  });

  it('states a reason for each documented exception', () => {
    for (const [file, reason] of ALLOWED_UNTYPED) {
      expect(reason.length).toBeGreaterThan(40);
      expect(walk(root).some((f) => f.endsWith(file))).toBe(true);
    }
  });
});
