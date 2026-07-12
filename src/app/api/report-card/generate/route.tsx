// src/app/api/report-card/generate/route.ts
// Generates a printable term report card (school logo, subject scores,
// attendance summary, class teacher + principal remarks, principal's
// signature image) using @react-pdf/renderer — pure JS, no headless
// browser/Chromium binary, which is what made puppeteer unreliable on
// Vercel serverless.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import React from 'react'

export const maxDuration = 30

const TERM_LABEL: Record<string, string> = {
  first: 'First Term', second: 'Second Term', third: 'Third Term',
}
const TYPE_LABEL: Record<string, string> = {
  day_test: 'Day Test', mid_term: 'Mid-Term', exam: 'Exam',
}

function styles(primary: string) {
  return StyleSheet.create({
    page: { padding: 40, fontSize: 10.5, fontFamily: 'Helvetica', color: '#1a1a1a' },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      borderBottomWidth: 3, borderBottomColor: primary, paddingBottom: 14, marginBottom: 18,
    },
    schoolRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    logo: { width: 44, height: 44, objectFit: 'contain', borderRadius: 6 },
    schoolName: { fontSize: 16, fontWeight: 700, color: primary },
    schoolSub: { fontSize: 8, color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 },
    docTitleWrap: { alignItems: 'flex-end' },
    docTitle: { fontSize: 13, fontWeight: 700 },
    docSub: { fontSize: 9, color: '#888', marginTop: 2 },

    infoGrid: {
      flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#f8f8f8',
      borderRadius: 8, padding: 12, marginBottom: 18,
    },
    infoRow: { width: '50%', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, paddingRight: 10 },
    infoLabel: { color: '#888', fontWeight: 700, fontSize: 9 },
    infoValue: { fontWeight: 700, fontSize: 9 },

    table: { marginBottom: 18 },
    tHeadRow: { flexDirection: 'row', backgroundColor: primary },
    th: { color: '#fff', fontSize: 8.5, fontWeight: 700, padding: 6, textTransform: 'uppercase' },
    tRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#eee' },
    tRowAlt: { backgroundColor: '#fafafa' },
    td: { fontSize: 9, padding: 6 },
    colSubject: { width: '30%' }, colType: { width: '18%' }, colScore: { width: '15%' },
    colGrade: { width: '12%' }, colRemarks: { width: '25%' },
    emptyRow: { textAlign: 'center', color: '#aaa', fontSize: 9, padding: 14 },

    summary: { flexDirection: 'row', gap: 10, marginBottom: 18 },
    summaryBox: { flex: 1, backgroundColor: '#f8f8f8', borderRadius: 8, padding: 10, alignItems: 'center' },
    summaryVal: { fontSize: 16, fontWeight: 700, color: primary },
    summaryLbl: { fontSize: 7.5, color: '#888', fontWeight: 700, textTransform: 'uppercase', marginTop: 2 },

    remarkBlock: { marginBottom: 14 },
    remarkTitle: { fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', color: '#888', marginBottom: 3 },
    remarkText: { fontSize: 10, lineHeight: 1.4, padding: 8, backgroundColor: '#f8f8f8', borderRadius: 6, minHeight: 16 },

    signRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
      marginTop: 24, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eee',
    },
    signBox: { alignItems: 'center', width: 180 },
    signImg: { height: 38, objectFit: 'contain', marginBottom: 3 },
    signLine: { borderTopWidth: 1, borderTopColor: '#333', paddingTop: 3, fontSize: 9.5, fontWeight: 700 },
    signRole: { fontSize: 8, color: '#888' },

    footer: { textAlign: 'center', color: '#aaa', fontSize: 8, marginTop: 20 },
  })
}

function ReportCardDocument({ data }: { data: any }) {
  const s = styles(data.primary)
  const rows = data.rows as any[]
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View style={s.schoolRow}>
            {data.logoUrl ? <Image src={data.logoUrl} style={s.logo} /> : null}
            <View>
              <Text style={s.schoolName}>{data.schoolName}</Text>
              <Text style={s.schoolSub}>Term Report Card</Text>
            </View>
          </View>
          <View style={s.docTitleWrap}>
            <Text style={s.docTitle}>{data.termLabel}</Text>
            <Text style={s.docSub}>{data.academicYear} Academic Session</Text>
          </View>
        </View>

        <View style={s.infoGrid}>
          <View style={s.infoRow}><Text style={s.infoLabel}>Student Name</Text><Text style={s.infoValue}>{data.studentName}</Text></View>
          <View style={s.infoRow}><Text style={s.infoLabel}>Admission No.</Text><Text style={s.infoValue}>{data.admissionNo}</Text></View>
          <View style={s.infoRow}><Text style={s.infoLabel}>Class</Text><Text style={s.infoValue}>{data.className}</Text></View>
          <View style={s.infoRow}><Text style={s.infoLabel}>Term</Text><Text style={s.infoValue}>{data.termLabel}</Text></View>
        </View>

        <View style={s.table}>
          <View style={s.tHeadRow}>
            <Text style={[s.th, s.colSubject]}>Subject</Text>
            <Text style={[s.th, s.colType]}>Type</Text>
            <Text style={[s.th, s.colScore]}>Score</Text>
            <Text style={[s.th, s.colGrade]}>Grade</Text>
            <Text style={[s.th, s.colRemarks]}>Remarks</Text>
          </View>
          {rows.length === 0 ? (
            <Text style={s.emptyRow}>No results recorded for this term yet.</Text>
          ) : (
            rows.map((r, i) => (
              <View key={i} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]}>
                <Text style={[s.td, s.colSubject]}>{r.subject}</Text>
                <Text style={[s.td, s.colType]}>{r.type}</Text>
                <Text style={[s.td, s.colScore]}>{r.score ?? '—'}/{r.max}</Text>
                <Text style={[s.td, s.colGrade]}>{r.grade}</Text>
                <Text style={[s.td, s.colRemarks]}>{r.remarks}</Text>
              </View>
            ))
          )}
        </View>

        <View style={s.summary}>
          <View style={s.summaryBox}><Text style={s.summaryVal}>{data.avgPct !== null ? data.avgPct + '%' : '—'}</Text><Text style={s.summaryLbl}>Average Score</Text></View>
          <View style={s.summaryBox}><Text style={s.summaryVal}>{data.attendancePct !== null ? data.attendancePct + '%' : '—'}</Text><Text style={s.summaryLbl}>Attendance</Text></View>
          <View style={s.summaryBox}><Text style={s.summaryVal}>{data.totalDays}</Text><Text style={s.summaryLbl}>Days Recorded</Text></View>
        </View>

        <View style={s.remarkBlock}>
          <Text style={s.remarkTitle}>Class Teacher's Remark</Text>
          <Text style={s.remarkText}>{data.classTeacherRemark || '—'}</Text>
        </View>
        <View style={s.remarkBlock}>
          <Text style={s.remarkTitle}>Principal's Remark</Text>
          <Text style={s.remarkText}>{data.principalRemark || '—'}</Text>
        </View>

        <View style={s.signRow}>
          <View style={s.signBox}>
            <Text style={s.signLine}>Class Teacher</Text>
          </View>
          <View style={s.signBox}>
            {data.signatureUrl ? <Image src={data.signatureUrl} style={s.signImg} /> : null}
            <Text style={s.signLine}>{data.principalName}</Text>
            <Text style={s.signRole}>Principal</Text>
          </View>
        </View>

        <Text style={s.footer}>Generated by {data.schoolName} on {data.generatedDate}</Text>
      </Page>
    </Document>
  )
}

export async function POST(request: Request) {
  try {
    const { report_card_id } = await request.json()
    if (!report_card_id) {
      return NextResponse.json({ error: 'report_card_id required' }, { status: 400 })
    }

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
      ? Math.round(rows.reduce((sum, r) => sum + (r.score / (r.max || 100)) * 100, 0) / rows.length)
      : null

    const docData = {
      primary: branding?.primary_color ?? '#800020',
      logoUrl: branding?.logo_url ?? null,
      schoolName: branding?.school_name ?? 'School',
      termLabel: TERM_LABEL[rc.term] ?? rc.term,
      academicYear: rc.academic_year,
      studentName: rc.student?.full_name ?? '—',
      admissionNo: rc.student?.admission_number ?? rc.student?.student_number ?? '—',
      className: rc.classes?.name ?? `${rc.classes?.class_level ?? ''} ${rc.classes?.section ?? ''}`.trim(),
      rows,
      avgPct,
      attendancePct,
      totalDays,
      classTeacherRemark: rc.class_teacher_remark,
      principalRemark: rc.principal_remark,
      signatureUrl: rc.approver?.signature_url ?? null,
      principalName: rc.approver?.full_name ?? '—',
      generatedDate: new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }),
    }

    const pdfBuffer = await renderToBuffer(<ReportCardDocument data={docData} />)

    const fileName = `report-cards/${rc.student_id}-${rc.academic_year.replace('/', '-')}-${rc.term}.pdf`
    const { error: uploadErr } = await admin.storage
      .from('pdf-exports')
      .upload(fileName, pdfBuffer, { upsert: true, contentType: 'application/pdf' })
    if (uploadErr) throw new Error('Storage upload failed: ' + uploadErr.message)

    const { data: signed } = await admin.storage
      .from('pdf-exports')
      .createSignedUrl(fileName, 60 * 60 * 24)

    return NextResponse.json({ url: signed?.signedUrl ?? fileName })

  } catch (err: any) {
    console.error('Report card generation error:', err)
    return NextResponse.json({ error: err.message ?? 'Failed to generate report card' }, { status: 500 })
  }
}
