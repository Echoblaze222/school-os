// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr'
import { compressImage } from '@/lib/images/compressImage'

// About 15 profile screens plus onboarding upload avatars straight from the
// browser to Storage. Rather than touching each one, compress here, in the
// one place they all go through: any multipart upload to the `avatars` bucket
// has its image part resized and re-encoded before it is sent. Everything
// else (and any failure) passes through untouched.
const COMPRESSED_UPLOAD_PATHS = ['/storage/v1/object/avatars/']

async function fetchWithImageCompression(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = (init?.method ?? 'GET').toUpperCase()
    const isUpload = method === 'POST' || method === 'PUT'
    if (isUpload && COMPRESSED_UPLOAD_PATHS.some(p => url.includes(p)) && init?.body instanceof FormData) {
      const form = new FormData()
      for (const [key, value] of init.body.entries()) {
        if (typeof value !== 'string') {
          const compressed = await compressImage(value)
          if (compressed !== value) {
            form.append(key, compressed, 'avatar.jpg')
            continue
          }
        }
        form.append(key, value)
      }
      return fetch(input, { ...init, body: form })
    }
  } catch {
    // fall through to the untouched request
  }
  return fetch(input, init)
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: fetchWithImageCompression } }
  )
}
