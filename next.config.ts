import type { NextConfig } from 'next'

// Placeholder values let CI / local builds succeed without real Supabase
// credentials. They must NEVER reach a real production deployment: with a
// placeholder URL the app builds, deploys, and then fails at runtime with
// confusing network errors. On a Vercel *production* build a missing value
// now fails the build immediately instead.
const isProductionDeploy = process.env.VERCEL_ENV === 'production'

function publicEnv(name: string, placeholder: string): string {
  const value = process.env[name]
  if (value) return value
  if (isProductionDeploy) {
    throw new Error(
      `[next.config] ${name} is not set for this production deployment. ` +
        `Set it in the Vercel project's Environment Variables before deploying.`,
    )
  }
  return placeholder
}

const nextConfig: NextConfig = {
  // FIX: without this, Next.js's bundler tries to bundle @sparticuz/chromium
  // like normal JS. That package relies on relative path resolution to find
  // its own Chromium binary files, which breaks under bundling — this is
  // exactly why PDF generation (receipts, report cards) was silently
  // failing and falling back to plain HTML. puppeteer-core is included too
  // since it launches chromium directly and has the same native-binary
  // requirement.
  serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.in' },
    ],
  },
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000'] },
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: publicEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://placeholder.supabase.co'),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: publicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'placeholder-key'),
  },
  // Baseline security headers. Deliberately NOT included: a
  // Content-Security-Policy. This app talks to Supabase (REST + realtime
  // websockets), LiveKit, Paystack, Firebase/FCM, Unsplash and Google Fonts,
  // so a CSP needs to be built and tested against those (ideally in
  // Report-Only mode first) rather than guessed at here, or it will break
  // chat, live classes or payments.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Live classes and photo/video chat need camera + microphone on the
          // app's own origin; everything else stays at the browser default.
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self)' },
        ],
      },
    ]
  },
}

export default nextConfig
