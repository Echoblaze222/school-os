// src/lib/certificates/pdf.tsx
// -------------------------------------------------------
// Renders the certificate PDF from a frozen `snapshot` (never live
// branding — see §26/§27: a principal change or logo update must never
// alter an already-issued certificate). Same rendering approach as
// /api/report-card/generate (@react-pdf/renderer, no headless browser,
// works on Vercel serverless) — kept restrained and print-safe in
// grayscale per §29, no decorative gradients per the house style.
// -------------------------------------------------------

import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import React from 'react'

export interface CertificateSnapshot {
  schoolName: string
  schoolMotto?: string | null
  logoUrl?: string | null
  studentName: string
  finalClass: string
  graduationYear: number
  certificateNumber: string
  issueDateLabel: string
  principalName: string
  principalTitle: string
  signatureUrl?: string | null
  stampUrl?: string | null
  qrDataUrl: string
  verificationUrl: string
}

function styles(primary: string) {
  return StyleSheet.create({
    page: {
      padding: 48, fontFamily: 'Helvetica', color: '#1a1a1a',
      border: `3pt solid ${primary}`, margin: 12,
    },
    header: { alignItems: 'center', marginBottom: 22 },
    logo: { width: 56, height: 56, objectFit: 'contain', marginBottom: 8 },
    schoolName: { fontSize: 20, fontWeight: 700, color: primary, textAlign: 'center' },
    schoolMotto: { fontSize: 9, color: '#888', fontStyle: 'italic', marginTop: 3, textAlign: 'center' },

    title: { fontSize: 15, letterSpacing: 3, textTransform: 'uppercase', textAlign: 'center', color: '#555', marginTop: 18, marginBottom: 22 },

    bodyText: { fontSize: 11.5, textAlign: 'center', color: '#333', lineHeight: 1.7, marginBottom: 4 },
    studentName: { fontSize: 26, fontWeight: 700, textAlign: 'center', color: '#111', marginVertical: 10 },

    footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 40 },
    signBlock: { alignItems: 'center', width: 170 },
    signImg: { height: 34, objectFit: 'contain', marginBottom: 3 },
    signLine: { borderTopWidth: 1, borderTopColor: '#333', paddingTop: 3, fontSize: 9.5, fontWeight: 700, width: '100%', textAlign: 'center' },
    signRole: { fontSize: 8, color: '#888' },

    qrBlock: { alignItems: 'center', width: 130 },
    qrImg: { width: 70, height: 70, marginBottom: 4 },
    qrLabel: { fontSize: 6.5, color: '#999', textAlign: 'center' },

    stampImg: { width: 70, height: 70, objectFit: 'contain' },

    bottomRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: '#ddd' },
    certNo: { fontSize: 8.5, color: '#999' },
  })
}

export function CertificateDocument({ data, primary }: { data: CertificateSnapshot; primary: string }) {
  const s = styles(primary)
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.header}>
          {data.logoUrl ? <Image src={data.logoUrl} style={s.logo} /> : null}
          <Text style={s.schoolName}>{data.schoolName}</Text>
          {data.schoolMotto ? <Text style={s.schoolMotto}>"{data.schoolMotto}"</Text> : null}
        </View>

        <Text style={s.title}>Certificate of Graduation</Text>

        <Text style={s.bodyText}>This is to certify that</Text>
        <Text style={s.studentName}>{data.studentName}</Text>
        <Text style={s.bodyText}>
          has successfully completed the {data.finalClass} programme and is hereby awarded this certificate
        </Text>
        <Text style={s.bodyText}>for the {data.graduationYear} graduating class.</Text>

        <View style={s.footerRow}>
          <View style={s.signBlock}>
            {data.signatureUrl ? <Image src={data.signatureUrl} style={s.signImg} /> : null}
            <Text style={s.signLine}>{data.principalName}</Text>
            <Text style={s.signRole}>{data.principalTitle}</Text>
          </View>

          {data.stampUrl ? <Image src={data.stampUrl} style={s.stampImg} /> : <View style={{ width: 70 }} />}

          <View style={s.qrBlock}>
            <Image src={data.qrDataUrl} style={s.qrImg} />
            <Text style={s.qrLabel}>Scan to verify authenticity</Text>
          </View>
        </View>

        <View style={s.bottomRow}>
          <Text style={s.certNo}>Certificate No. {data.certificateNumber}</Text>
          <Text style={s.certNo}>Issued {data.issueDateLabel}</Text>
          <Text style={s.certNo}>{data.verificationUrl}</Text>
        </View>
      </Page>
    </Document>
  )
}
