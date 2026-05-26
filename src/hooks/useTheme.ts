// hooks/useTheme.ts
'use client'

import { useState, useEffect } from 'react'

type Theme = 'dark' | 'light'

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('dark')

  useEffect(() => {
    const saved = localStorage.getItem('schoolos_theme') as Theme | null
    const resolved = saved ?? 'dark'
    setThemeState(resolved)
    // FIX: always explicitly set 'dark' or 'light' — never empty string
    document.documentElement.setAttribute('data-theme', resolved)
  }, [])

  function setTheme(next: Theme) {
    setThemeState(next)
    localStorage.setItem('schoolos_theme', next)
    document.documentElement.setAttribute('data-theme', next)
  }

  function toggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return { theme, setTheme, toggleTheme }
}
