// src/app/layout.tsx
// ─────────────────────────────────────────────────────────────────────────────────
// FIX 1 — Icon path mismatch:
//   metadata.icons referenced '/icons/icon-192.png' and '/icons/icon-512.png'
//   but the actual files in public/icons/ are named 'icon-192x192.png' and
//   'icon-512x512.png' (matching manifest.json). Wrong paths cause the PWA
//   install prompt to fail and the home screen icon to be blank.
//
// FIX 2 — SW registration timing:
//   The inline <script> waited for the 'load' event before registering sw.js.
//   On Android Chrome, 'load' fires late relative to when the user might tap
//   "Enable Alerts". If the tap happens before 'load', navigator.serviceWorker
//   .ready stalls. Changed to register immediately (the browser queues it
//   safely) so the SW is ready well before any user interaction.
//
// SEO — metadataBase + OpenGraph/Twitter defaults:
//   Every page's metadata (root layout and every page.tsx that doesn't
//   override openGraph/twitter) now resolves relative OG image URLs and
//   canonical links against SITE_URL instead of Next silently warning
//   "metadataBase not set" and falling back to localhost in previews/
//   social-share unfurls. See src/lib/seo.ts for the shared constants —
//   update SITE_URL there once a production domain exists.
// ─────────────────────────────────────────────────────────────────────────────────

import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import ThemeScript   from './ThemeScript'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { ToastProvider } from '@/contexts/ToastContext'
import AndroidBackHandler from '@/components/AndroidBackHandler'
import { SITE_URL, SITE_NAME, DEFAULT_TITLE, DEFAULT_DESCRIPTION, DEFAULT_OG_IMAGE, TWITTER_HANDLE } from '@/lib/seo'

const inter = Inter({
  subsets:  ['latin'],
  variable: '--font-inter',
  display:  'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default:  DEFAULT_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  keywords: [
    'school management system Nigeria', 'school portal Nigeria', 'school fees software',
    'school ERP Nigeria', 'student management system', 'school admissions Nigeria',
    'find schools in Nigeria', 'Nigerian secondary schools', 'school SaaS Nigeria',
  ],
  manifest:    '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: SITE_NAME },
  icons: {
    icon: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png' }],
  },
  robots: { index: true, follow: true },
  alternates: { canonical: SITE_URL },
  openGraph: {
    title:       DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    url:         SITE_URL,
    siteName:    SITE_NAME,
    images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: SITE_NAME }],
    locale:      'en_NG',
    type:        'website',
  },
  twitter: {
    card:        'summary_large_image',
    title:       DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images:      [DEFAULT_OG_IMAGE],
    site:        TWITTER_HANDLE,
  },
}

export const viewport: Viewport = {
  themeColor:    '#080C14',
  width:         'device-width',
  initialScale:  1,
  maximumScale:  1,
  userScalable:  false,
  viewportFit:   'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
      </head>
      <body className={inter.className}>
        <ThemeProvider>
          <ToastProvider>
            {children}
            <AndroidBackHandler />
          </ToastProvider>
          <script
            dangerouslySetInnerHTML={{
              __html: `
                if ('serviceWorker' in navigator) {
                  // FIX: Register immediately (not on 'load') so the SW is
                  // active before the user taps "Enable Alerts". The browser
                  // safely defers actual installation without blocking render.
                  navigator.serviceWorker.register('/sw.js').catch(function(){});

                  // sw.js calls self.skipWaiting() so a new SW version
                  // activates right away - but that only changes which SW
                  // handles FUTURE network requests. Any tab that was
                  // already open keeps running the JS it already loaded
                  // into memory, indefinitely, with no prompt to refresh.
                  // That's exactly the shape of bug reports like "I tap
                  // this button and nothing happens" when the fix already
                  // shipped - the device just never re-fetched it. Reload
                  // once, automatically, the moment a new SW takes over.
                  var refreshingForNewSW = false;
                  navigator.serviceWorker.addEventListener('controllerchange', function() {
                    if (refreshingForNewSW) return;
                    refreshingForNewSW = true;
                    window.location.reload();
                  });
                }
              `,
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  )
}
