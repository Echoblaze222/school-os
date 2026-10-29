// src/app/layout.tsx
// -----------------------------------------------------------------------------
// FIX 1: Icon path mismatch
//   metadata.icons referenced '/icons/icon-192.png' and '/icons/icon-512.png'
//   but the actual files in public/icons/ are named 'icon-192x192.png' and
//   'icon-512x512.png' (matching manifest.json). Wrong paths cause the PWA
//   install prompt to fail and the home screen icon to be blank.
//
// FIX 2: SW registration timing
//   The inline <script> waited for the 'load' event before registering sw.js.
//   On Android Chrome, 'load' fires late relative to when the user might tap
//   "Enable Alerts". If the tap happens before 'load', navigator.serviceWorker
//   .ready stalls. Changed to register immediately (the browser queues it
//   safely) so the SW is ready well before any user interaction.
//
// FIX 3: Legacy token aliases
//   Imports ./legacy-tokens.css so the old --burgundy / --text-accent / --error
//   style names used by 34 CSS modules resolve to the live design tokens
//   instead of being undefined on every page except register-school.
// -----------------------------------------------------------------------------

import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import './legacy-tokens.css'
import ThemeScript   from './ThemeScript'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { ToastProvider } from '@/contexts/ToastContext'
import AndroidBackHandler from '@/components/AndroidBackHandler'

const inter = Inter({
  subsets:  ['latin'],
  variable: '--font-inter',
  display:  'swap',
})

export const metadata: Metadata = {
  title:       'SchoolOS | Nigeria\'s Smartest School Portal',
  description: 'Complete school management system for Nigerian schools',
  manifest:    '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'SchoolOS' },
  icons: {
    // FIX: was 'icon-192.png' and 'icon-512.png'. Actual filenames are icon-192x192.png / icon-512x512.png
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
                  // activates right away - but a tab that is already open
                  // keeps running the JS it loaded earlier. Reloading the
                  // moment the new SW takes over would wipe whatever the
                  // user is typing (a marks sheet, a message), so we only
                  // note that an update is ready and reload once the app
                  // goes to the background, when nothing can be lost.
                  // The very first SW install also fires 'controllerchange'
                  // (clients.claim); that is not an update, so it is ignored
                  // - previously it caused an extra reload on first visit.
                  var hadController = !!navigator.serviceWorker.controller;
                  var updateReady = false;
                  navigator.serviceWorker.addEventListener('controllerchange', function() {
                    if (!hadController) { hadController = true; return; }
                    updateReady = true;
                  });
                  document.addEventListener('visibilitychange', function() {
                    if (updateReady && document.visibilityState === 'hidden') {
                      updateReady = false;
                      window.location.reload();
                    }
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
