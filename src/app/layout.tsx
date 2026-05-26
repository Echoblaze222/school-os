import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import ThemeScript from './ThemeScript'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title:       'SchoolOS — Nigeria\'s Smartest School Portal',
  description: 'Complete school management system for Nigerian schools',
  manifest:    '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'SchoolOS' },
  icons: {
    icon:  [{ url: '/icons/icon-192.png', sizes: '192x192' }, { url: '/icons/icon-512.png', sizes: '512x512' }],
    apple: [{ url: '/icons/apple-touch-icon.png' }],
  },
}

export const viewport: Viewport = {
  themeColor:          '#080C14',
  width:               'device-width',
  initialScale:        1,
  maximumScale:        1,
  userScalable:        false,
  viewportFit:         'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
      </head>
      <body className={inter.className}>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(() => {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  )
}
