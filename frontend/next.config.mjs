/**
 * The browser only ever talks to this Next.js origin. /api/* and /admin/queues/*
 * are proxied to the Express backend, so:
 *  - session cookies are first-party (no third-party cookie / CORS problems in production)
 *  - Google & Slack OAuth redirect URIs live on one public origin
 */
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:4000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: 'https', hostname: 'lh3.googleusercontent.com' }] },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${BACKEND_URL}/api/:path*` },
      { source: '/admin/queues', destination: `${BACKEND_URL}/admin/queues` },
      { source: '/admin/queues/:path*', destination: `${BACKEND_URL}/admin/queues/:path*` },
    ];
  },
};

export default nextConfig;
