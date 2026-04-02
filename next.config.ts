import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Proxy Paperclip Vite assets
      { source: '/@vite/:path*', destination: 'http://localhost:3100/@vite/:path*' },
      { source: '/@react-refresh', destination: 'http://localhost:3100/@react-refresh' },
      { source: '/node_modules/:path*', destination: 'http://localhost:3100/node_modules/:path*' },
      { source: '/src/:path*', destination: 'http://localhost:3100/src/:path*' },
      // Proxy Paperclip app assets
      { source: '/paperclip-assets/:path*', destination: 'http://localhost:3100/assets/:path*' },
    ]
  },
  async headers() {
    return [
      {
        source: '/companies',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        source: '/((?!companies).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "connect-src 'self' https://api.github.com http://localhost:3100",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

export default nextConfig
