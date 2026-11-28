// src/lib/offline/offlineMode.ts
// True inside an offline twin page (see components/offline/OfflineShell.tsx).
// Shared dashboard components read it to hide or relabel the few things that
// only work with a connection, so a twin can render the very same component the
// online dashboard uses instead of a separate look-alike.

import { createContext, useContext } from 'react'

export const OfflineModeContext = createContext(false)

export function useOfflineMode(): boolean {
  return useContext(OfflineModeContext)
}
