// src/app/layout.tsx
// CRITICAL: This file imports globals.css which provides ALL CSS variables
// Without this import, every page will render with no colours/backgrounds
import type { Metadata } from 'next'
import { ThemeScript } from './ThemeScript'
import './globals.css'

export const metadata: Metadata = {
  title: 'SchoolOS — Premium School Portal',
  description: 'A premium school management system',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Prevent theme flash — runs before React */}
        <ThemeScript />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400&family=DM+Sans:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
