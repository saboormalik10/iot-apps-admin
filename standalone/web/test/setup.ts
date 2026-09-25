import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './msw/server';

// MSW: network is mocked in the gate job (plan §CI). Unhandled requests bypass
// so a missing mock surfaces loudly rather than hanging.
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'bypass' });
  toleratePageAbortSignals();
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  globalThis.fetch = fetchBeforeWrap ?? globalThis.fetch;
  server.close();
});

/**
 * jsdom supplies its own AbortController, and React Query hands its signal to
 * fetch. Node 24's fetch refuses a signal that is not Node's own ("Expected signal
 * to be an instance of AbortSignal"); Node 20's did not check. A browser has one
 * AbortSignal, so this is purely the test environment: a signal Node will not
 * take is honoured if already aborted, and otherwise left out — MSW answers at
 * once, so there is nothing in flight to cancel.
 */
let fetchBeforeWrap: typeof fetch | undefined;
function toleratePageAbortSignals(): void {
  const inner = globalThis.fetch;
  fetchBeforeWrap = inner;
  const nodeTakes = (signal: AbortSignal) => {
    try {
      new Request('http://probe.invalid/', { signal });
      return true;
    } catch {
      return false;
    }
  };
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal;
    if (!signal || nodeTakes(signal)) return inner(input, init);
    if (signal.aborted) return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
    const { signal: _dropped, ...rest } = init!;
    return inner(input, rest);
  }) as typeof fetch;
}

// jsdom lacks ResizeObserver (used by Recharts' ResponsiveContainer).
if (typeof globalThis !== 'undefined' && !('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}

// jsdom lacks scrollIntoView (used to keep the command-palette cursor in view).
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom lacks matchMedia (used by next-themes / responsive hooks).
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// jsdom lacks the Pointer Capture API, which Radix's Select uses to track a
// press. Without these the trigger throws on click and the listbox never opens,
// so any test that picks an option fails with a confusing "option not found".
if (typeof Element !== 'undefined' && !Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
