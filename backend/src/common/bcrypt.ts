/**
 * The ONE bcrypt cost factor for the platform (M24 W1).
 *
 * It lives here because it had already drifted: five modules each declared their
 * own `BCRYPT_COST`, and `platform.service.ts` — the route that creates a new
 * CUSTOMER'S ADMINISTRATOR — used 10 while everything else used 12. The most
 * privileged account of every new customer was getting the weakest hash in the
 * system, and nothing about reading either file on its own would show that. Two
 * seeding scripts passed a bare `10` for the same reason.
 *
 * 12 is ~250 ms per hash on the current hardware. That cost is deliberate: it is
 * paid once per login, and it is what makes an offline attack on a stolen dump
 * expensive. Raising it further starts to matter for the login endpoint's own
 * availability — see the note on the ThrottlerGuard in `auth.controller.ts`.
 */
export const BCRYPT_COST = 12;
