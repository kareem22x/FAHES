/** @type {import('next').NextConfig} */
const nextConfig = {
  // ===== Dev server origins =====
  // Next.js refuses cross-origin requests to dev-only assets (`/_next/*`, HMR)
  // unless the requesting origin is listed here. Without this the site loads
  // from an IP address but every script and stylesheet 404s, so it renders
  // unstyled and the client never hydrates.
  //
  // Only affects `next dev`. Production builds ignore this entirely.
  // Add an entry here whenever you reach the dev server from a new address.
  allowedDevOrigins: [
    'localhost',
    '127.0.0.1',
    '192.168.100.137', // LAN (Ethernet)
    '192.168.100.*', // any host on the LAN subnet
    '172.20.64.1', // Hyper-V default switch
    '145.82.50.93', // public IP (only usable once the router forwards the port)
    ...(process.env.DEV_ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? []),
  ],

  // ===== Performance Optimizations =====

  // Enable React strict mode for better development experience
  reactStrictMode: true,

  // Image optimization configuration
  images: {
    // Enable image optimization in production
    unoptimized: process.env.NODE_ENV === 'development',
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'xaainchpmehfwdezxfwo.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'img.clerk.com',
      },
    ],
    minimumCacheTTL: 60,
  },

  // Compiler optimizations
  compiler: {
    // Remove console logs in production
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  // Experimental features for better performance
  experimental: {
    // Optimize CSS imports
    optimizeCss: true,
  },

  // ===== Security Headers =====
  // Kept in sync with `proxy.ts`. Middleware does not run for static assets, so
  // the baseline lives here too and the edge adds the per-route extras.
  //
  // The Permissions-Policy is scoped, not global: the inspector's field surface
  // legitimately needs geolocation and the camera (see `permissionsPolicy` in
  // proxy.ts), and a bare `geolocation=()` would deny the feature to the very
  // origin that owns it. Order matters — Next applies every matching entry, and
  // the later, more specific one overwrites the broader value.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
          },
        ],
      },
      // Field dashboard: allow the sensors the workflow actually uses, on this
      // origin only. Declared after the catch-all so it takes precedence.
      {
        source: '/inspector/field/:path*',
        headers: [
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self)' },
        ],
      },
      // Cache static assets aggressively
      {
        source: '/public/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },

  // ===== Redirects & Rewrites =====
  async redirects() {
    return [
      // Redirect old URLs if needed
      // {
      //   source: '/old-path',
      //   destination: '/new-path',
      //   permanent: true,
      // },
    ]
  },

  // Power optimized config
  poweredByHeader: false, // Remove X-Powered-By header
  compress: true, // Enable gzip compression
  generateEtags: true, // Generate ETags for caching

  // TypeScript configuration
  typescript: {
    // Don't fail build on type errors in development
    ignoreBuildErrors: process.env.NODE_ENV === 'development',
  },
}

export default nextConfig
