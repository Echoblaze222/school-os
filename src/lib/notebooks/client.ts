// src/lib/notebooks/client.ts
// Browser helpers for the Books screens.

// A plain shape (not a discriminated union): this project compiles with strict off, where unions on `ok` do not narrow.
export interface ApiResult<T> { ok: boolean; data: T; error: string }

export async function api<T = any>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, data: undefined as unknown as T, error: body?.error ?? 'Something went wrong. Please try again.' }
    return { ok: true, data: body as T, error: '' }
  } catch {
    return { ok: false, data: undefined as unknown as T, error: 'You seem to be offline. Check your connection and try again.' }
  }
}

/**
 * Downloads a book as PDF. In the Android app (a WebView) normal downloads are
 * unreliable, so there we open the share sheet (Save to Files / WhatsApp / Drive);
 * in a browser it is a normal file download. Returns an error message, or null on success.
 */
export async function downloadBookPdf(bookId: string, title: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/notebooks/${encodeURIComponent(bookId)}/pdf`)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return body?.error ?? 'Could not create the PDF. Please try again.'
    }
    const blob = await res.blob()
    const name = `${title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'book'}.pdf`
    const file = new File([blob], name, { type: 'application/pdf' })

    const nav: any = navigator
    const native = !!(window as any).Capacitor?.isNativePlatform?.()
    if (native && nav.canShare?.({ files: [file] })) {
      try { await nav.share({ files: [file], title }); return null } catch (e: any) {
        if (e?.name === 'AbortError') return null // user closed the share sheet
      }
    }

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    if (native) window.open(url, '_blank') // last resort inside a WebView
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return null
  } catch {
    return 'Could not download the PDF. Check your connection and try again.'
  }
}
