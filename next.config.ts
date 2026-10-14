import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The web container runs the standalone server (docs/IDEA.md §14). It holds no secrets:
  // all auth and data come from the Go API under /api/v1.
  output: 'standalone',
  reactStrictMode: true,
  // When Next proxies the API (development), its gzip holds back the live-updates stream (SSE).
  // In production nginx sends /api straight to the Go API, so this changes nothing there.
  compress: !process.env.NETOPOLOGY_API_URL,
  // During development the API can be mocked in the browser (MSW, see mocks/), or proxied to the Go API.
  async rewrites() {
    const api = process.env.NETOPOLOGY_API_URL;
    return api ? [{ source: '/api/v1/:path*', destination: `${api}/api/v1/:path*` }] : [];
  },

  allowedDevOrigins: [
    '127.0.0.1'
  ]
};

export default nextConfig;
