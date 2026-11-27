'use client'
// src/components/public/ThemeToggleFab.tsx
// Small fixed light/dark switch for the full-screen public pages that have no
// navigation bar of their own (select-school, register-school, onboarding).
// The landing page already has this toggle inside PublicNav.

import { MoonIcon, SunIcon } from '@/components/Icons'
import { useTheme } from '@/hooks/useTheme'

export default function ThemeToggleFab() {
  const { theme, toggleTheme } = useTheme()
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      style={{
        position: 'fixed',
        top: 'max(16px, env(safe-area-inset-top))',
        right: 16,
        zIndex: 50,
        width: 44,
        height: 44,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-surface)',
        border: '1px solid var(--glass-border)',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
      }}
    >
      {theme === 'dark' ? <SunIcon size={17} /> : <MoonIcon size={17} />}
    </button>
  )
}
