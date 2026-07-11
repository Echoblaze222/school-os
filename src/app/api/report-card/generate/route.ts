// src/app/api/report-card/generate/route.ts
// Generates a printable term report card (school logo, subject scores,
// attendance summary, class teacher + principal remarks, principal's
// signature image) using the same HTML→PDF pipeline as receipts/generate.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// FIX: Vercel's default function timeout (10s Hobby / 15s Pro) is often not
// enough for a cold Chromium launch + page render. Without this, a slow
// cold start gets killed mid-generation, which looks identical to Chromium
// failing to launch — both end up silently falling back to HTML.
export const maxDuration = 60

const TERM_LABEL: Record<string, string> = {
  first: 'First Term', second: 'Second Term', third: 'Third Term',
}
const TYPE_LABEL: Record<string, string> = {
  day_test: 'Day Test', mid_term: 'Mid-Term', exam: 'Exam',
}

export async function POST(request: Request) {
  try {
    const { report_card_id } = await request.json()
    if (!report_card_id) {
      return NextResponse.json({ error: 'report_card_id required' }, { status: 400 })
    }

    // Auth via the requesting user's own session (respects RLS: students/
    // parents can only ever reach an approved report card that's theirs;
    // staff can preview any status for their own school).
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: rc, error: rcErr } = await supabase
      .from('report_cards')
      .select(`
        *,
        student:profiles!report_cards_student_id_fkey ( full_name, admission_number, student_number ),
        approver:profiles!report_cards_approved_by_fkey ( full_name, signature_url ),
        classes ( name, class_level, section )
      `)
      .eq('id', report_card_id)
      .single()

    if (rcErr || !rc) {
      return NextResponse.json({ error: 'Report card not found or not accessible' }, { status: 404 })
    }

    // From here on use the admin client for the supporting reads (results,
    // attendance, branding) — the report_cards row itself was already
    // access-checked above via the user's own RLS-scoped client.
    const admin = createAdminClient()

    const { data: branding } = await admin
      .from('school_branding')
      .select('school_name, logo_url, primary_color')
      .eq('id', rc.school_id)
      .maybeSingle()

    const { data: results } = await admin
      .from('results')
      .select('score, max_score, grade, result_type, remarks, class_subjects ( subjects ( name ) )')
      .eq('student_id', rc.student_id)
      .eq('term', rc.term)
      .eq('academic_year', rc.academic_year)

    let attendanceRows: any[] = []
    if (rc.attendance_start_date && rc.attendance_end_date) {
      const { data: att } = await admin
        .from('attendance')
        .select('status')
        .eq('student_id', rc.student_id)
        .eq('class_id', rc.class_id)
        .gte('date', rc.attendance_start_date)
        .lte('date', rc.attendance_end_date)
      attendanceRows = att ?? []
    }
    const present = attendanceRows.filter(a => a.status === 'present').length
    const absent  = attendanceRows.filter(a => a.status === 'absent').length
    const late    = attendanceRows.filter(a => a.status === 'late').length
    const totalDays = attendanceRows.length
    const attendancePct = totalDays ? Math.round(((present + late) / totalDays) * 100) : null

    const rows = (results ?? []).map((r: any) => ({
      subject: r.class_subjects?.subjects?.name ?? '—',
      type:    TYPE_LABEL[r.result_type] ?? r.result_type,
      score:   r.score,
      max:     r.max_score,
      grade:   r.grade ?? '—',
      remarks: r.remarks ?? '',
    }))
    const avgPct = rows.length
      ? Math.round(rows.reduce((s, r) => s + (r.score / (r.max || 100)) * 100, 0) / rows.length)
      : null

    const schoolName  = branding?.school_name ?? 'School'
    const primary     = branding?.primary_color ?? '#800020'
    const logoUrl     = branding?.logo_url ?? ''
    const className   = rc.classes?.name ?? `${rc.classes?.class_level ?? ''} ${rc.classes?.section ?? ''}`.trim()
    const studentName = rc.student?.full_name ?? '—'
    const admissionNo = rc.student?.admission_number ?? rc.student?.student_number ?? '—'

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #fff; color: #1a1a1a; font-size: 12.5px; }
  .page { max-width: 700px; margin: 0 auto; padding: 36px 40px; }
  .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid ${primary}; padding-bottom: 18px; margin-bottom: 22px; }
  .school { display: flex; align-items: center; gap: 12px; }
  .school img { width: 52px; height: 52px; object-fit: contain; border-radius: 8px; }
  .school-name { font-size: 19px; font-weight: 800; color: ${primary}; }
  .school-sub { font-size: 10px; color: #888; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }
  .doc-title { text-align: right; }
  .doc-title h2 { font-size: 15px; font-weight: 800; }
  .doc-title p  { font-size: 11px; color: #888; margin-top: 2px; }

  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin-bottom: 22px; padding: 14px 18px; background: #f8f8f8; border-radius: 10px; }
  .info-row span:first-child { color: #888; font-weight: 600; }
  .info-row span:last-child  { font-weight: 700; float: right; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 22px; }
  th { background: ${primary}; color: #fff; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; padding: 8px 10px; text-align: left; }
  td { padding: 7px 10px; border-bottom: 1px solid #eee; font-size: 12px; }
  tr:nth-child(even) td { background: #fafafa; }

  .summary { display: flex; gap: 14px; margin-bottom: 22px; }
  .summary-box { flex: 1; background: #f8f8f8; border-radius: 10px; padding: 12px 16px; text-align: center; }
  .summary-box .val { font-size: 20px; font-weight: 900; color: ${primary}; }
  .summary-box .lbl { font-size: 10px; color: #888; font-weight: 700; text-transform: uppercase; margin-top: 2px; }

  .remark-block { margin-bottom: 18px; }
  .remark-title { font-size: 10.5px; font-weight: 800; text-transform: uppercase; color: #888; margin-bottom: 4px; }
  .remark-text { font-size: 12.5px; line-height: 1.5; padding: 10px 14px; background: #f8f8f8; border-radius: 8px; min-height: 20px; }

  .sign-row { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 30px; padding-top: 16px; border-top: 1px solid #eee; }
  .sign-box { text-align: center; width: 220px; }
  .sign-box img { height: 46px; object-fit: contain; margin-bottom: 4px; }
  .sign-line { border-top: 1px solid #333; padding-top: 4px; font-size: 11.5px; font-weight: 700; }
  .sign-role { font-size: 10px; color: #888; }

  .footer { text-align: center; color: #aaa; font-size: 10px; margin-top: 24px; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="school">
      ${logoUrl ? `<img src="${logoUrl}" />` : ''}
      <div>
        <div class="school-name">${schoolName}</div>
        <div class="school-sub">Term Report Card</div>
      </div>
    </div>
    <div class="doc-title">
      <h2>${TERM_LABEL[rc.term] ?? rc.term}</h2>
      <p>${rc.academic_year} Academic Session</p>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-row"><span>Student Name</span><span>${studentName}</span></div>
    <div class="info-row"><span>Admission No.</span><span>${admissionNo}</span></div>
    <div class="info-row"><span>Class</span><span>${className}</span></div>
    <div class="info-row"><span>Term</span><span>${TERM_LABEL[rc.term] ?? rc.term}</span></div>
  </div>

  <table>
    <thead><tr><th>Subject</th><th>Type</th><th>Score</th><th>Grade</th><th>Remarks</th></tr></thead>
    <tbody>
      ${rows.map(r => `<tr><td>${r.subject}</td><td>${r.type}</td><td>${r.score ?? '—'}/${r.max}</td><td>${r.grade}</td><td>${r.remarks}</td></tr>`).join('')}
      ${rows.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:#aaa;padding:16px;">No results recorded for this term yet.</td></tr>' : ''}
    </tbody>
  </table>

  <div class="summary">
    <div class="summary-box"><div class="val">${avgPct !== null ? avgPct + '%' : '—'}</div><div class="lbl">Average Score</div></div>
    <div class="summary-box"><div class="val">${attendancePct !== null ? attendancePct + '%' : '—'}</div><div class="lbl">Attendance</div></div>
    <div class="summary-box"><div class="val">${totalDays}</div><div class="lbl">Days Recorded</div></div>
  </div>

  <div class="remark-block">
    <div class="remark-title">Class Teacher's Remark</div>
    <div class="remark-text">${rc.class_teacher_remark || '—'}</div>
  </div>
  <div class="remark-block">
    <div class="remark-title">Principal's Remark</div>
    <div class="remark-text">${rc.principal_remark || '—'}</div>
  </div>

  <div class="sign-row">
    <div class="sign-box">
      <div class="sign-line">Class Teacher</div>
    </div>
    <div class="sign-box">
      ${rc.approver?.signature_url ? `<img src="${rc.approver.signature_url}" />` : ''}
      <div class="sign-line">${rc.approver?.full_name ?? '—'}</div>
      <div class="sign-role">Principal</div>
    </div>
  </div>

  <div class="footer">Generated by ${schoolName} on ${new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
</div>
</body>
</html>`

    // ── HTML → PDF (same pipeline as receipts/generate) ──────────────────
    let pdfBuffer: Buffer | null = null
    let pdfError: string | null = null
    try {
      // FIX: previously these used `.catch(() => null)`, which swallowed
      // import errors with ZERO trace anywhere — not even a console.warn.
      // If puppeteer-core/@sparticuz/chromium failed to import at runtime,
      // we'd never have known. Now the actual error is captured either way.
      const puppeteer = await import('puppeteer-core')
      const chromium  = await import('@sparticuz/chromium')
      const browser = await (puppeteer as any).default.launch({
        args: (chromium as any).default.args,
        defaultViewport: (chromium as any).default.defaultViewport,
        executablePath: await (chromium as any).default.executablePath(),
        headless: true,
      })
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'networkidle0' })
      pdfBuffer = await page.pdf({ format: 'A4', printBackground: true })
      await browser.close()
    } catch (e: any) {
      pdfError = e?.message ?? String(e)
      console.error('Report card PDF generation failed, using HTML fallback:', e)
    }

    const fileName = `report-cards/${rc.student_id}-${rc.academic_year.replace('/', '-')}-${rc.term}.${pdfBuffer ? 'pdf' : 'html'}`
    const content  = pdfBuffer ?? Buffer.from(html, 'utf-8')
    const mimeType = pdfBuffer ? 'application/pdf' : 'text/html'

    const { error: uploadErr } = await admin.storage
      .from('pdf-exports')
      .upload(fileName, content, { upsert: true, contentType: mimeType })
    if (uploadErr) throw new Error('Storage upload failed: ' + uploadErr.message)

    const { data: signed } = await admin.storage
      .from('pdf-exports')
      .createSignedUrl(fileName, 60 * 60 * 24) // 24h link

    // pdfError is included (only when generation actually failed) so the
    // real cause is visible in the browser Network tab without needing
    // Vercel log access — remove this once PDF generation is confirmed
    // working reliably.
    return NextResponse.json({ url: signed?.signedUrl ?? fileName, pdfError })

  } catch (err: any) {
    console.error('Report card generation error:', err)
    return NextResponse.json({ error: err.message ?? 'Failed to generate report card' }, { status: 500 })
  }
}
