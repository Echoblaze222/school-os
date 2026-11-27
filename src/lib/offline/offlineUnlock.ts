// src/lib/offline/offlineUnlock.ts
// CLIENT ONLY. The gate and the app-facing helpers around unlockVerifier.ts.
//
// Offline unlock exists ONLY in the Android app (Capacitor native), where app
// storage is sandboxed from other apps and users. In a browser every function
// here is a no-op / "unavailable", so browsers keep requiring a connection to
// unlock. Nothing here ever throws: sign-in and unlock must not break because of it.

import { Capacitor } from '@capacitor/core'
import { offlineStorageAvailable } from './db'
import { rememberUser } from './identity'
import { checkVerifier, storeVerifier, type OfflineCheck } from './unlockVerifier'

export function offlineUnlockSupported(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export async function rememberPasswordForOffline(userId: string, password: string): Promise<void> {
  if (!offlineUnlockSupported() || !offlineStorageAvailable()) return
  try {
    await storeVerifier(userId, password)
  } catch {
    // Offline unlock is a bonus; never block signing in over it.
  }
}

/**
 * Call right after a password was confirmed ONLINE (sign-in, or unlocking the
 * lock screen): remembers who this phone belongs to and, in the Android app,
 * refreshes the offline unlock verifier.
 */
export async function rememberLogin(userId: string, password: string): Promise<void> {
  rememberUser(userId)
  await rememberPasswordForOffline(userId, password)
}

export async function verifyOfflinePassword(userId: string, password: string): Promise<OfflineCheck> {
  if (!offlineUnlockSupported() || !offlineStorageAvailable()) return { result: 'unavailable' }
  try {
    return await checkVerifier(userId, password)
  } catch {
    return { result: 'unavailable' }
  }
}
