import { applyDecorators } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';

/**
 * Which client(s) an endpoint is intended for.
 * - `nep-link`  → the NEP-LINK mobile app (observator-nep-link-ble)
 * - `met-link`  → the MET-LINK mobile app (met-link-mob)
 * - `admin`     → the Angular admin dashboard
 *
 * Anything left un-decorated is treated as `admin`-only by the doc filter
 * (see `filterByConsumer` in main.ts).
 */
export type Consumer = 'nep-link' | 'met-link' | 'admin';

/** OpenAPI extension key the audience-dropdown filter reads. */
export const CONSUMERS_EXTENSION = 'x-consumers';

/**
 * Tag an operation with its intended consumer(s). Emits an `x-consumers`
 * OpenAPI extension that `main.ts` uses to build the per-audience specs.
 *
 * @example
 *   @Consumers('nep-link', 'met-link')  // shared by both mobile apps
 *   @Consumers('met-link')              // MET-LINK app only
 */
export function Consumers(...consumers: Consumer[]) {
  return applyDecorators(ApiExtension(CONSUMERS_EXTENSION, consumers));
}
