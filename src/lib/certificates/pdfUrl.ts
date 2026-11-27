// src/lib/certificates/pdfUrl.ts
// -------------------------------------------------------
// Certificate PDFs live in the private `pdf-exports` bucket at a path that
// is fully determined by (school_id, certificate_number). We never store a
// long-lived signed URL: every read mints a short-lived one, so a leaked or
// forwarded link stops working within an hour. Access control stays in the
// API routes that call this (they authenticate and scope the rows first).
// -------------------------------------------------------

import { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

export const CERTIFICATE_PDF_BUCKET = 'pdf-exports'
export const CERTIFICATE_LINK_TTL_SECONDS = 60 * 60 // 1 hour

export function certificatePdfPath(schoolId: string, certificateNumber: string): string {
  return `certificates/${schoolId}/${certificateNumber.replace(/\//g, '-')}.pdf`
}

// Legacy rows may hold an old long-lived https URL. Only an https URL is an
// acceptable fallback; a bare storage path is never shown to a client.
function safeFallback(value: string | null | undefined): string | null {
  return value && /^https?:\/\//.test(value) ? value : null
}

export interface CertificatePdfRef {
  schoolId: string
  certificateNumber: string | null | undefined
  fallback?: string | null
}

// One Storage call for the whole list (createSignedUrls), not one per row.
export async function signCertificatePdfs(admin: AdminClient, rows: CertificatePdfRef[]): Promise<(string | null)[]> {
  const out: (string | null)[] = rows.map(r => safeFallback(r.fallback))
  const targets = rows.map((r, index) => ({
    index,
    path: r.certificateNumber ? certificatePdfPath(r.schoolId, r.certificateNumber) : null,
  }))
  const paths = targets.filter(t => t.path).map(t => t.path as string)
  if (paths.length === 0) return out

  const { data } = await admin.storage
    .from(CERTIFICATE_PDF_BUCKET)
    .createSignedUrls(paths, CERTIFICATE_LINK_TTL_SECONDS)

  const byPath = new Map<string, string>()
  for (const d of data ?? []) {
    if (d.path && d.signedUrl) byPath.set(d.path, d.signedUrl)
  }
  for (const t of targets) {
    if (!t.path) continue
    const url = byPath.get(t.path)
    if (url) out[t.index] = url
  }
  return out
}

export async function signCertificatePdf(
  admin: AdminClient,
  schoolId: string,
  certificateNumber: string | null | undefined,
  fallback: string | null = null,
): Promise<string | null> {
  const [url] = await signCertificatePdfs(admin, [{ schoolId, certificateNumber, fallback }])
  return url
}
