/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // A design prototype with no backend: no rewrites, no env, no instrumentation.
  // The headers cost nothing and answer the first question a client's IT reviewer
  // asks when they open a hosted prototype.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // It shows live-looking readings for a named rail corridor. It must not
          // turn up in a search for "Sydney Metro flood".
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
};

export default nextConfig;
