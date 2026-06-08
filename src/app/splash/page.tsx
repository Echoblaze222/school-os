'use client'
// src/app/splash/page.tsx
// Animated logo splash shown on first load before redirecting to /select-school

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import styles from './splash.module.css'

export default function SplashPage() {
  const router = useRouter()

  useEffect(() => {
    // After animation completes (2.8s), navigate to select-school
    const timer = setTimeout(() => {
      router.replace('/select-school')
    }, 2800)
    return () => clearTimeout(timer)
  }, [router])

  return (
    <div className={styles.splash}>
      {/* Ambient glow background */}
      <div className={styles.ambientGlow} />
      <div className={styles.ambientGlow2} />

      {/* Circuit grid overlay */}
      <div className={styles.circuitGrid} />

      <div className={styles.content}>
        {/* Logo container with pulse + scale animation */}
        <div className={styles.logoWrap}>
          <div className={styles.logoRing} />
          <div className={styles.logoRing2} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/logo.png"
            alt="SchoolOS Logo"
            className={styles.logo}
          />
        </div>

        {/* Brand text */}
        <div className={styles.brandWrap}>
          <h1 className={styles.brandName}>SchoolOS</h1>
          <p className={styles.brandTagline}>Premium School Management</p>
        </div>

        {/* Loading bar */}
        <div className={styles.loadBar}>
          <div className={styles.loadBarFill} />
        </div>
      </div>
    </div>
  )
}
