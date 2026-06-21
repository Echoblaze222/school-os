// src/app/layout.tsx
// ─────────────────────────────────────────────────────────────────────────────
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
// ─────────────────────────────────────────────────────────────────────────────

import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import ThemeScript   from './ThemeScript'
import { ThemeProvider } from '@/contexts/ThemeContext'

const inter = Inter({
  subsets:  ['latin'],
  variable: '--font-inter',
  display:  'swap',
})

export const metadata: Metadata = {
  title:       'SchoolOS — Nigeria\'s Smartest School Portal',
  description: 'Complete school management system for Nigerian schools',
  manifest:    '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'SchoolOS' },
  icons: {
    // FIX: was 'icon-192.png' and 'icon-512.png' — actual filenames are icon-192x192.png / icon-512x512.png
    icon: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png' }],
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
          {children}
          <script
            dangerouslySetInnerHTML={{
              __html: `
                if ('serviceWorker' in navigator) {
                  // FIX: Register immediately (not on 'load') so the SW is
                  // active before the user taps "Enable Alerts". The browser
                  // safely defers actual installation without blocking render.
                  navigator.serviceWorker.register('/sw.js').catch(function(){});
                }
              `,
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  )
}
