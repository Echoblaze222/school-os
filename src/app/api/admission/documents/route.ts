// src/app/api/admission/documents/route.ts
// Public platform (Phase 4, Lane C) - §53 admission document security.
// Phase 4, Lane G (§52 malicious documents) added the magic-byte check in
// PUT below - see that comment for why it's needed even though POST
// already restricts the declared mimeType.
//
// Two-step upload, not a raw client-side storage.upload() call:
//   1. POST here first - validates the file (type/size), the caller's
//      ownership of the application, and that the application is still
//      editable, then returns a short-lived signed upload URL.
//   2. Client uploads bytes directly to that signed URL.
//   3. Client calls PUT here to register the resulting metadata row.
// This is deliberately NOT the pattern used by the existing
// secretary/documents module (public bucket + getPublicUrl) - that
// pattern doesn't meet §53's "private storage" / "secure access URLs"
// requirement, so it isn't reused here even though it would have been
// less code.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const BUCKET = 'admission-documents'
const MAX_SIZE_BYTES = 15 * 1024 * 1024 // 15MB - matches the DB constraint; this is the pre-upload gate

// Magic-byte signatures for the four accepted types. A declared mimeType
// in the POST/PUT body is just a string the caller chose - Supabase's
// signed upload URL does not itself enforce content-type, so nothing
// before this stopped someone from uploading an .exe or .html file with
// mimeType: 'application/pdf' attached. Checking real file signatures is
// the §52/§53 "malicious documents" / "scanned, validated" control this
// system was otherwise missing. Not a substitute for a real antivirus
// scan (scan_status stays 'pending' -> 'clean' here, not a claim of full
// malware scanning) - it does close the "wrong file entirely" class of
// attack, which is the cheap, common one.
const MAGIC_BYTES: Record<string, (buf: Uint8Array) => boolean> = {
  'application/pdf': (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46, // %PDF
  'image/jpeg':       (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png':        (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/webp':       (b) =>
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // RIFF
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50, // WEBP
}
const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])

// POST - request a signed upload URL for one document
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const { applicationId, documentKey, fileName, mimeType, sizeBytes } = body ?? {}

  if (!applicationId || !documentKey || !fileName || !mimeType || typeof sizeBytes !== 'number') {
    return NextResponse.json({ error: 'Missing required upload details.' }, { status: 400 })
  }
  if (!ALLOWED_MIME.has(mimeType)) {
    return NextResponse.json({ error: 'Only PDF, JPEG, PNG, or WEBP files are accepted.' }, { status: 400 })
  }
  if (sizeBytes <= 0 || sizeBytes > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'File must be under 15MB.' }, { status: 400 })
  }
  // Filename is only ever used as a display label + inside the storage
  // path - reject anything that could be used for path traversal
  // (../, absolute paths) even though storage.foldername policy checks
  // key on the application_id segment, not the filename, as defense in depth.
  const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 150)
  if (!safeName) {
    return NextResponse.json({ error: 'Invalid file name.' }, { status: 400 })
  }

  // Ownership + editability check. RLS on admission_applications already
  // means this select returns nothing if the caller doesn't own the
  // application, but check explicitly for a clear error rather than a
  // confusing empty-result 404 further down.
  const { data: application, error: appErr } = await supabase
    .from('admission_applications')
    .select('id, school_id, status, applicant_profile_id')
    .eq('id', applicationId)
    .maybeSingle()

  if (appErr || !application) {
    return NextResponse.json({ error: 'Application not found.' }, { status: 404 })
  }
  if (application.applicant_profile_id !== user.id) {
    return NextResponse.json({ error: 'Not authorized for this application.' }, { status: 403 })
  }
  if (application.status !== 'draft') {
    return NextResponse.json({ error: 'Documents can only be added while the application is a draft.' }, { status: 409 })
  }

  // Path convention consumed by the storage RLS policy:
  // <school_id>/<application_id>/<timestamp>-<safeName>
  const path = `${application.school_id}/${application.id}/${Date.now()}-${safeName}`

  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path)

  if (signErr || !signed) {
    return NextResponse.json({ error: 'Could not prepare the upload. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({
    uploadUrl: signed.signedUrl,
    token: signed.token,
    path,
  })
}

// PUT - register the uploaded document's metadata after the client
// finishes the direct-to-storage upload
export async function PUT(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const { applicationId, documentKey, fileName, path, mimeType, sizeBytes } = body ?? {}

  if (!applicationId || !documentKey || !path || !mimeType || typeof sizeBytes !== 'number') {
    return NextResponse.json({ error: 'Missing required document details.' }, { status: 400 })
  }
  if (!ALLOWED_MIME.has(mimeType) || sizeBytes <= 0 || sizeBytes > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'Invalid document.' }, { status: 400 })
  }
  // The path must actually belong to this application - prevents a
  // caller from registering an arbitrary storage path (e.g. one
  // belonging to a different application) against this record.
  if (!String(path).includes(`/${applicationId}/`)) {
    return NextResponse.json({ error: 'Document path does not match this application.' }, { status: 400 })
  }

  // §52/§53 - verify the uploaded bytes actually are what mimeType claims
  // before trusting them anywhere (a school reviewer will open this file).
  // Downloading the whole object here (capped at 15MB by the check above)
  // rather than a byte-range request, since supabase-js's storage client
  // doesn't expose partial reads - acceptable at this size ceiling, worth
  // revisiting if the max upload size ever grows substantially.
  const { data: fileBlob, error: downloadErr } = await supabase.storage.from(BUCKET).download(path)
  if (downloadErr || !fileBlob) {
    return NextResponse.json({ error: 'Could not verify the uploaded file. Please try again.' }, { status: 500 })
  }
  const headBytes = new Uint8Array(await fileBlob.slice(0, 16).arrayBuffer())
  const signatureOk = MAGIC_BYTES[mimeType]?.(headBytes) ?? false

  if (!signatureOk) {
    // The uploaded bytes don't match the declared type - remove the
    // orphaned object immediately rather than leaving an unregistered,
    // unvalidated file sitting in storage.
    await supabase.storage.from(BUCKET).remove([path])
    return NextResponse.json(
      { error: "This file doesn't look like a valid PDF/JPEG/PNG/WEBP. Please re-export it and try again." },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('admission_documents')
    .insert({
      application_id: applicationId,
      document_key: documentKey,
      file_name: String(fileName ?? 'document').slice(0, 200),
      storage_path: path,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      uploaded_by: user.id,
      scan_status: 'clean', // signature-verified above; not a full malware scan (see MAGIC_BYTES comment)
    })
    .select()
    .single()

  // RLS on admission_documents (uploaded_by = auth.uid() check +
  // ownership-of-application check) is what actually stops this insert
  // from succeeding against someone else's application or a
  // non-draft one - this route doesn't need to re-derive that here.
  if (error) {
    // Insert failed after we already validated and kept the file -
    // clean it up rather than leaving an orphaned, unregistered object.
    await supabase.storage.from(BUCKET).remove([path])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ document: data }, { status: 201 })
}

// GET - list documents for one application (RLS scopes visibility)
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const applicationId = searchParams.get('applicationId')
  if (!applicationId) return NextResponse.json({ error: 'applicationId is required.' }, { status: 400 })

  const { data, error } = await supabase
    .from('admission_documents')
    .select('id, document_key, file_name, mime_type, size_bytes, created_at, storage_path')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Return short-lived signed URLs, never a public/permanent link (§53).
  const withUrls = await Promise.all((data ?? []).map(async doc => {
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.storage_path, 60 * 10) // 10 minutes
    return { ...doc, storage_path: undefined, url: signed?.signedUrl ?? null }
  }))

  return NextResponse.json({ documents: withUrls })
}
