import type { NextConfig } from 'next'

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
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key',
  },
}

export default nextConfig