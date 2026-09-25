/**
 * `server-only` is a build-time marker with no runtime behaviour. Vitest has no
 * server/client boundary to enforce, so it resolves to nothing here — this lets
 * server-side modules (lib/bff/*) be unit-tested directly.
 */
export {};
