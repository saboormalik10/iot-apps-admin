// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.

export const environment = {
  production: false,
  // Platform-specific Maps keys — injected at build time via environment swap.
  // During development the web/browser key is used for `ionic serve`.
  googleMapsApiKey: {
    web: 'AIzaSyDcJ-mqW15hIh4bGMNcB6YR5i3pskVZywk', // browser / ionic serve
    android: 'AIzaSyDzdYiK4ZG-RVA8-z2U4AzwXU0V9a6QLTM', // Android native
    ios: 'AIzaSyDbH-DhpYy-LBpIpbHMIZ2UzBKR-YeUbfk', // iOS native
  },
};
