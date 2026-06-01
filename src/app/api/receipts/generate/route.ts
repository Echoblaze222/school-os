// src/app/api/receipts/generate/route.ts
// Generates a styled HTML receipt, converts to PDF via
// @sparticuz/chromium + puppeteer-core (Vercel compatible)
// Falls back to HTML string if PDF generation is unavailable.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const RATE = 1600 // fallback NGN/USD rate

export async function POST(request: Request) {
  try {
    const { payment_id } = await request.json()
    if (!payment_id) return NextResponse.json({ error: 'payment_id required' }, { status: 400 })

    const admin = createAdminClient()

    // Fetch payment details
    const { data: payment, error: pErr } = await admin
      .from('payments')
      .select(`
        id, receipt_number, amount_paid_ngn, amount_paid_usd,
        currency_used, payment_method, payment_reference, paid_at,
        invoice_id, student_id,
        payment_invoices (
          amount_due_ngn, status,
          fee_structures ( description, term, academic_year )
        ),
        profiles!payments_student_id_fkey (
          full_name,
          student_profiles ( admission_number )
        ),
        profiles!payments_received_by_fkey ( full_name )
      `)
      .eq('id', payment_id)
      .single()

    if (pErr || !payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    const p         = payment as any
    const student   = p.profiles
    const inv       = p.payment_invoices
    const fee       = inv?.fee_structures
    const isPaid    = inv?.status === 'completed'
    const usdAmount = p.amount_paid_usd ?? (p.amount_paid_ngn / RATE)

    // ── Generate HTML receipt ──────────────────────────────
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #fff; color: #1a1a1a; font-size: 13px; }
  .page { max-width: 520px; margin: 0 auto; padding: 40px 32px; }

  /* Header */
  .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 2px solid #800020; }
  .logo { display: flex; align-items: center; gap: 10px; }
  .logo-icon { width: 44px; height: 44px; background: #800020; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
  .logo-text { font-size: 18px; font-weight: 800; color: #800020; letter-spacing: -0.02em; }
  .logo-sub  { font-size: 10px; color: #888; font-weight: 600; margin-top: 2px; letter-spacing: 0.04em; text-transform: uppercase; }
  .receipt-title { text-align: right; }
  .receipt-label { font-size: 11px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
  .receipt-num   { font-size: 16px; font-weight: 800; color: #1a1a1a; }

  /* Paid stamp */
  .paid-stamp { display: inline-block; border: 3px solid #16a34a; color: #16a34a; font-size: 22px; font-weight: 900; padding: 6px 16px; border-radius: 6px; letter-spacing: 0.1em; transform: rotate(-8deg); margin-bottom: 20px; }

  /* Section */
  .section { margin-bottom: 24px; }
  .section-title { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #eee; }
  .row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
  .row-label { color: #666; font-weight: 500; }
  .row-value { font-weight: 700; color: #1a1a1a; text-align: right; max-width: 60%; }

  /* Amount box */
  .amount-box { background: #f8f8f8; border-radius: 10px; padding: 16px 20px; margin-bottom: 24px; }
  .amount-ngn { font-size: 26px; font-weight: 900; color: #800020; letter-spacing: -0.02em; }
  .amount-usd { font-size: 14px; color: #888; margin-top: 4px; font-weight: 600; }

  /* Footer */
  .footer { border-top: 1px solid #eee; padding-top: 16px; text-align: center; color: #aaa; font-size: 11px; line-height: 1.6; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="logo">
      <div class="logo-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
        </svg>
      </div>
      <div>
        <div class="logo-text">SchoolOS</div>
        <div class="logo-sub">Payment Receipt</div>
      </div>
    </div>
    <div class="receipt-title">
      <div class="receipt-label">Receipt No.</div>
      <div class="receipt-num">${p.receipt_number}</div>
    </div>
  </div>

  ${isPaid ? '<div style="text-align:center"><span class="paid-stamp">PAID</span></div>' : ''}

  <div class="amount-box">
    <div class="amount-ngn">₦${p.amount_paid_ngn.toLocaleString('en-NG')}</div>
    <div class="amount-usd">≈ $${usdAmount.toFixed(2)} USD</div>
  </div>

  <div class="section">
    <div class="section-title">Student Information</div>
    <div class="row"><span class="row-label">Full Name</span><span class="row-value">${student?.full_name ?? '—'}</span></div>
    <div class="row"><span class="row-label">Admission No.</span><span class="row-value">${student?.student_profiles?.admission_number ?? '—'}</span></div>
  </div>

  <div class="section">
    <div class="section-title">Payment Details</div>
    <div class="row"><span class="row-label">Description</span><span class="row-value">${fee?.description ?? 'School Fees'}</span></div>
    <div class="row"><span class="row-label">Term</span><span class="row-value">${fee?.term ? fee.term.charAt(0).toUpperCase() + fee.term.slice(1) + ' Term' : '—'}</span></div>
    <div class="row"><span class="row-label">Academic Year</span><span class="row-value">${fee?.academic_year ?? '—'}</span></div>
    <div class="row"><span class="row-label">Payment Method</span><span class="row-value">${(p.payment_method ?? 'Bank Transfer').replace('_', ' ')}</span></div>
    <div class="row"><span class="row-label">Reference</span><span class="row-value">${p.payment_reference ?? '—'}</span></div>
    <div class="row"><span class="row-label">Date Paid</span><span class="row-value">${new Date(p.paid_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
  </div>

  <div class="footer">
    This is an official payment receipt generated by SchoolOS.<br>
    Keep this document for your records. · schoolos.com
  </div>
</div>
</body>
</html>`

    // ── Try to generate PDF using puppeteer ───────────────
    let pdfBuffer: Buffer | null = null
    try {
      const puppeteer = await import('puppeteer-core').catch(() => null)
      const chromium  = await import('@sparticuz/chromium').catch(() => null)

      if (puppeteer && chromium) {
        const browser = await (puppeteer as any).default.launch({
          args: (chromium as any).default.args,
          defaultViewport: (chromium as any).default.defaultViewport,
          executablePath: await (chromium as any).default.executablePath(),
          headless: true,
        })
        const page = await browser.newPage()
        await page.setContent(html, { waitUntil: 'networkidle0' })
        pdfBuffer = await page.pdf({ format: 'A5', printBackground: true })
        await browser.close()
      }
    } catch (e) {
      console.warn('PDF generation unavailable, using HTML fallback:', e)
    }

    // ── Save to Supabase Storage ──────────────────────────
    const fileName = `receipts/${p.receipt_number}.${pdfBuffer ? 'pdf' : 'html'}`
    const content  = pdfBuffer ?? Buffer.from(html, 'utf-8')
    const mimeType = pdfBuffer ? 'application/pdf' : 'text/html'

    const { error: uploadErr } = await admin.storage
      .from('pdf-exports')
      .upload(fileName, content, { upsert: true, contentType: mimeType })

    if (uploadErr) throw new Error('Storage upload failed: ' + uploadErr.message)

    // Get signed URL (valid 1 year)
    const { data: signed } = await admin.storage
      .from('pdf-exports')
      .createSignedUrl(fileName, 60 * 60 * 24 * 365)

    const receiptUrl = signed?.signedUrl ?? fileName

    // ── Save to digital_receipts table ────────────────────
    await admin.from('digital_receipts').upsert({
      payment_id:   p.id,
      student_id:   p.student_id,
      receipt_url:  fileName,
      generated_at: new Date().toISOString(),
    }, { onConflict: 'payment_id' })

    return NextResponse.json({ url: receiptUrl, receipt_number: p.receipt_number })

  } catch (err: any) {
    console.error('Receipt generation error:', err)
    return NextResponse.json({ error: err.message ?? 'Failed to generate receipt' }, { status: 500 })
  }
}
