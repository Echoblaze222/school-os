// src/lib/images/compressImage.ts
// -------------------------------------------------------
// Browser-side image compression. Phone photos arrive at 3 to 6 MB (the 16
// avatars in production average 1.2 MB). Resizing to at most 1024 px on the
// long edge and re-encoding as JPEG usually gives 60 to 150 KB, which is what
// lets the Free Supabase plan (1 GB storage, 5 GB egress) go much further.
//
// Safe by design: on ANY problem (unsupported format, no canvas, decode
// error) it returns the original file unchanged, so an upload never fails
// because of compression.
// -------------------------------------------------------

const MAX_EDGE = 1024
const JPEG_QUALITY = 0.82
const SKIP_BELOW_BYTES = 150 * 1024 // already small enough, leave it alone

export async function compressImage(input: Blob): Promise<Blob> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return input
  if (!input.type.startsWith('image/')) return input
  if (input.type === 'image/gif' || input.type === 'image/svg+xml') return input
  if (input.size <= SKIP_BELOW_BYTES) return input

  try {
    const bitmap = await createImageBitmap(input, { imageOrientation: 'from-image' })
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close?.()
      return input
    }
    // JPEG has no transparency: flatten onto white.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()

    const output = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
    return output && output.size < input.size ? output : input
  } catch {
    return input
  }
}
