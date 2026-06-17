// src/app/api/bursar/generate-invoices/route.ts
// Generates payment_invoices for all students based on fee_structures
// Called by the bursar after creating fee structures for a term

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const TERM_MAP: Record<string, string> = {
  'First Term':  'first',
  'Second Term': 'second',
  'Third Term':  'third',
}

export async function POST(req: NextRequest) {
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('school_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || !['bursar', 'principal', 'super_admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { term, academic_year } = body // e.g. "First Term", "2025/2026"

  if (!term || !academic_year) {
    return NextResponse.json({ error: 'term and academic_year are required' }, { status: 400 })
  }

  const termKey = TERM_MAP[term] ?? term.toLowerCase().split(' ')[0]

  // Use service role for write operations bypassing RLS
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // 1. Get all fee structures for this school/term/year
  const { data: feeStructures, error: feesErr } = await admin
    .from('fee_structures')
    .select('id, class_id, amount_ngn, description, classes(class_level)')
    .eq('school_id', profile.school_id)
    .eq('term', termKey)
    .eq('academic_year', academic_year)

  if (feesErr) return NextResponse.json({ error: feesErr.message }, { status: 500 })
  if (!feeStructures || feeStructures.length === 0) {
    return NextResponse.json({ error: 'No fee structures found for this term/year. Create fee structures first.' }, { status: 404 })
  }

  // 2. Get all active students for this school
  const { data: students, error: studErr } = await admin
    .from('profiles')
    .select('id, class_id, class_level, full_name')
    .eq('school_id', profile.school_id)
    .eq('role', 'student')
    .eq('is_active', true)

  if (studErr) return NextResponse.json({ error: studErr.message }, { status: 500 })
  if (!students || students.length === 0) {
    return NextResponse.json({ error: 'No active students found in this school.' }, { status: 404 })
  }

  // 3. Build invoice records
  const invoicesToInsert: any[] = []
  const skipped: string[] = []

  for (const student of students) {
    // Match fee structures for this student's class
    const matchingFees = feeStructures.filter(
      (fs: any) => fs.class_id === student.class_id ||
        (fs.classes as any)?.class_level === student.class_level
    )

    if (matchingFees.length === 0) {
      skipped.push(student.full_name)
      continue
    }

    for (const fee of matchingFees) {
      // Check if invoice already exists for this student + fee structure
      const { data: existing } = await admin
        .from('payment_invoices')
        .select('id')
        .eq('student_id', student.id)
        .eq('fee_structure_id', fee.id)
        .maybeSingle()

      if (existing) continue // already exists, skip

      invoicesToInsert.push({
        student_id:        student.id,
        fee_structure_id:  fee.id,
        amount_due_ngn:    fee.amount_ngn,
        amount_paid_ngn:   0,
        balance_ngn:       fee.amount_ngn,
        status:            'pending',
        school_id:         profile.school_id,
        due_date:          null,
      })
    }
  }

  if (invoicesToInsert.length === 0) {
    return NextResponse.json({
      message: 'All invoices already exist for this term.',
      created: 0,
      skipped: skipped.length,
    })
  }

  // 4. Batch insert invoices
  const { error: insErr } = await admin.from('payment_invoices').insert(invoicesToInsert)
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  return NextResponse.json({
    message: `Created ${invoicesToInsert.length} invoice${invoicesToInsert.length !== 1 ? 's' : ''}.`,
    created: invoicesToInsert.length,
    skipped: skipped.length,
    skippedNames: skipped.slice(0, 5), // first 5 for display
  })
}
