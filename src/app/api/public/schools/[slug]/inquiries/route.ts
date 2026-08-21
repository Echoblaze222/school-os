// src/app/api/public/schools/[slug]/inquiries/route.ts
// "Request information" form on a public school profile (§45, §57).
//
// Deliberately not the Lane C admission-application system: no document
// upload, no tracked application record, no applicant portal. Just a
// short message routed to the school's principal/secretary inbox, the
// same way a contact form works on any marketing site. This is the one
// write endpoint on the public platform that accepts input from a
// completely unauthenticated caller, so it gets the most scrutiny:
// rate limiting (IP and target school, so one bad actor can't spam one
// school's inbox, and a distributed attempt can't spray many schools),
// server-side validation of every field, a honeypot for basic bots, and a
// hashed (not raw) IP at rest.

import { NextResponse }      from 'next/server'
import crypto                 from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { notifyRoles }       from '@/lib/notify'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_NAME = 120
const MAX_MESSAGE = 2000
const MAX_PHONE = 30

function hashIp(ip: string) {
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const body = await request.json().catch(() => null)

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }

    // Honeypot: a real visitor never fills this hidden field. Silently
    // report success to the bot so it doesn't learn to look elsewhere for
    // the real field.
    if (typeof body.website === 'string' && body.website.trim().length > 0) {
      return NextResponse.json({ ok: true })
    }

    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
    const message = typeof body.message === 'string' ? body.message.trim() : ''

    if (!fullName || fullName.length > MAX_NAME) {
      return NextResponse.json(
        { error: `Please enter your name (up to ${MAX_NAME} characters).` },
        { status: 400 }
      )
    }
    if (!EMAIL_RE.test(email) || email.length > 200) {
      return NextResponse.json(
        { error: 'Please enter a valid email address so the school can reply to you.' },
        { status: 400 }
      )
    }
    if (phone && phone.length > MAX_PHONE) {
      return NextResponse.json({ error: 'That phone number looks too long.' }, { status: 400 })
    }
    if (!message || message.length < 10) {
      return NextResponse.json(
        { error: 'Please add a short message (at least 10 characters) about what you\u2019d like to know.' },
        { status: 400 }
      )
    }
    if (message.length > MAX_MESSAGE) {
      return NextResponse.json(
        { error: `Message is too long. Please keep it under ${MAX_MESSAGE} characters.` },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    const { data: school, error: schoolError } = await admin
      .from('schools')
      .select('id, name, is_publicly_listed, is_platform_active')
      .eq('slug', slug)
      .maybeSingle()

    if (schoolError) throw schoolError
    if (!school || !school.is_publicly_listed || !school.is_platform_active) {
      // Same message whether the school doesn't exist, isn't listed, or is
      // suspended: an inquiry endpoint shouldn't reveal which.
      return NextResponse.json({ error: 'This school is not accepting inquiries right now.' }, { status: 404 })
    }

    const ip = getClientIp(request)
    const ipCheck = await checkRateLimit(admin, 'public_inquiry_ip', ip, 5, 3600)
    if (!ipCheck.allowed) {
      const r = ipCheck.errorResponse!
      return NextResponse.json({ error: r.error }, {
        status: r.status,
        headers: r.retryAfter ? { 'Retry-After': String(r.retryAfter) } : undefined,
      })
    }
    const schoolCheck = await checkRateLimit(admin, 'public_inquiry_school', school.id, 30, 3600)
    if (!schoolCheck.allowed) {
      const r = schoolCheck.errorResponse!
      return NextResponse.json({ error: r.error }, {
        status: r.status,
        headers: r.retryAfter ? { 'Retry-After': String(r.retryAfter) } : undefined,
      })
    }

    const { error: insertError } = await admin.from('school_inquiries').insert({
      school_id: school.id,
      full_name: fullName,
      email,
      phone: phone || null,
      message,
      source: 'profile_apply',
      ip_hash: hashIp(ip),
    })

    if (insertError) throw insertError

    // Best-effort: a notification failure must never fail the submission
    // the visitor is waiting on.
    notifyRoles(admin, school.id, ['principal', 'secretary'], {
      title: 'New inquiry from your public profile',
      body: `${fullName} asked about ${school.name}.`,
      type: 'school_inquiry',
      action_url: '/dashboard/principal/settings',
    }).catch(err => console.warn('[public inquiry] notify failed (non-critical):', err))

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[api/public/schools/[slug]/inquiries] failed:', err)
    return NextResponse.json(
      { error: 'Could not send your message right now. Please try again shortly.' },
      { status: 500 }
    )
  }
}
