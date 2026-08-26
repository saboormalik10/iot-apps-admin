import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Policy test — reads SOURCE, needs no database.
 *
 * `@Throttle(...)` only sets metadata. It configures `ThrottlerGuard`; it does
 * not install it. This app does NOT register that guard globally, so a route
 * decorated with `@Throttle` but sitting on a controller without
 * `@UseGuards(ThrottlerGuard)` is silently unlimited — and reads, in review and
 * in Swagger, exactly like a rate-limited route.
 *
 * That is not hypothetical. `POST /auth/login` carried `@Throttle({limit: 10})`
 * and an `@ApiErrors('tooManyRequests')` while accepting unlimited password
 * guesses; 30 consecutive failed logins returned 30×401 and zero 429 (M24 W1).
 *
 * There are two honest ways to fix that bug class: register the guard globally,
 * or assert the pairing. Global registration would put the 10 req/min default on
 * every route in the app, including ingest and ordinary dashboard browsing, so
 * this asserts the pairing instead.
 */
describe('throttle coverage', () => {
  const root = join(__dirname, '..', 'src');

  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.controller.ts') ? [join(dir, e.name)] : [],
    );

  // A decorator inside a commented-out block is not live code. M15 disabled whole
  // controllers by commenting them, so ignoring these matters.
  const liveLines = (src: string) =>
    src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'));

  it('every controller using @Throttle also applies ThrottlerGuard', () => {
    const unguarded: string[] = [];

    for (const file of walk(root)) {
      const lines = liveLines(readFileSync(file, 'utf8'));
      const throttled = lines.some((l) => l.includes('@Throttle('));
      if (!throttled) continue;

      const guarded = lines.some((l) => l.includes('UseGuards') && l.includes('ThrottlerGuard'));
      if (!guarded) unguarded.push(file.replace(`${root}/`, ''));
    }

    expect(unguarded).toEqual([]);
  });

  it('the authentication routes are rate limited', () => {
    const src = readFileSync(join(root, 'auth', 'auth.controller.ts'), 'utf8');
    const lines = liveLines(src);

    expect(lines.some((l) => l.includes('UseGuards') && l.includes('ThrottlerGuard'))).toBe(true);

    // Named explicitly: these are the credential-guessing and mail-sending
    // routes, and a future edit that drops the decorator should fail here rather
    // than be noticed in production traffic.
    for (const route of ['login', 'register', 'forgot-password', 'verify-reset-code', 'reset-password']) {
      const at = lines.findIndex((l) => l.includes(`@Post('${route}')`));
      expect(at).toBeGreaterThan(-1);
      const preceding = lines.slice(Math.max(0, at - 8), at).join('\n');
      expect(preceding).toContain('@Throttle(');
    }
  });
});
