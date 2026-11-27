// src/lib/notebooks/imageUpload.ts
//
// Browser-only. Turns a photo picked on a phone into a small, safe JPEG and uploads it
// to the same public "notes" storage bucket the note files use.
//   - Only real images are accepted (JPG, PNG, WebP, GIF). The file is redrawn on a
//     canvas, which also strips location/camera data and guarantees it decodes.
//   - Big camera photos are shrunk (longest side 1600px) so notes stay light on
//     mobile data and the book/PDF stay fast.

import { createClient } from '@/lib/supabase/client'

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
export const MAX_IMAGE_MB = 15

async function loadBitmap(file: File): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
      return { width: bmp.width, height: bmp.height, draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h), close: () => bmp.close() }
    } catch { /* fall back to <img> below */ }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('That file is not a readable image.'))
      el.src = url
    })
    return { width: img.naturalWidth, height: img.naturalHeight, draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h), close: () => URL.revokeObjectURL(url) }
  } catch (e) {
    URL.revokeObjectURL(url)
    throw e
  }
}

export async function prepareImage(file: File, maxEdge = 1600, quality = 0.82): Promise<Blob> {
  if (!ALLOWED.includes(file.type)) throw new Error('Choose a JPG, PNG or WebP photo.')
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) throw new Error(`That photo is bigger than ${MAX_IMAGE_MB} MB.`)

  const bmp = await loadBitmap(file)
  try {
    if (!bmp.width || !bmp.height) throw new Error('That file is not a readable image.')
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not process that image on this device.')
    ctx.fillStyle = '#ffffff' // transparent PNGs become white, not black
    ctx.fillRect(0, 0, w, h)
    bmp.draw(ctx, w, h)
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality))
    canvas.width = 0
    canvas.height = 0
    if (!blob) throw new Error('Could not process that image on this device.')
    return blob
  } finally {
    bmp.close()
  }
}

/** Uploads a note image for the signed-in user and returns its public https URL. */
export async function uploadMyNoteImage(file: File): Promise<string> {
  const blob = await prepareImage(file)
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Please sign in again to add images.')
  const { data: profile } = await supabase.from('profiles').select('school_id').eq('id', user.id).single()
  const schoolId = (profile as any)?.school_id
  if (!schoolId) throw new Error('Could not find your school.')

  const path = `${schoolId}/${user.id}/img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  const { error } = await supabase.storage.from('notes').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (error) throw new Error(`Upload failed: ${error.message}`)
  const url = supabase.storage.from('notes').getPublicUrl(path).data?.publicUrl
  if (!url) throw new Error('Upload worked but the image link could not be made.')
  return url
}

/** A link typed or pasted by the user. Must be https. Returns a clean URL or null. */
export function cleanImageLink(input: string): string | null {
  const t = input.trim()
  if (!t) return null
  try {
    const u = new URL(t)
    if (u.protocol !== 'https:') return null
    return u.href.replace(/\(/g, '%28').replace(/\)/g, '%29')
  } catch {
    return null
  }
}

export function altFromFileName(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, '').replace(/[\[\]()_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Image'
}
