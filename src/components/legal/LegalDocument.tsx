// src/components/legal/LegalDocument.tsx
// Shared layout for the Privacy Policy and the Terms & Conditions: a plain,
// white page with black text, numbered sections, a table of contents and
// print-friendly styling. It is deliberately independent of the app's dark
// theme: legal text is always shown black on white.
//
// Order inside a section: intro, paragraphs, items, groups, table, after, footer.
// `after` is for paragraphs that must come after a list or table (for example
// how to exercise the rights that were just listed).

import Link from 'next/link'
import LegalBackLink from './LegalBackLink'
import styles from './legal.module.css'

export interface LegalGroup {
  label: string
  items: string[]
}

export interface LegalTable {
  head: string[]
  rows: string[][]
}

export interface LegalSection {
  title: string
  intro?: string
  paragraphs?: string[]
  items?: string[]
  groups?: LegalGroup[]
  table?: LegalTable
  after?: string[]
  footer?: string
}

interface Props {
  title: string
  subtitle: string
  effective: string
  version: string
  summary?: string[]
  sections: LegalSection[]
  relatedHref: string
  relatedLabel: string
}

export default function LegalDocument({
  title, subtitle, effective, version, summary, sections, relatedHref, relatedLabel,
}: Props) {
  return (
    <div className={styles.page}>
      {/* Legal text is always black on white, whatever theme the app is in. */}
      <style>{`html, body { background: #ffffff !important; color-scheme: light; }`}</style>

      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <Link href="/" className={styles.brand}>SchoolOS</Link>
          <LegalBackLink />
        </div>
      </header>

      <main className={styles.container}>
        <p className={styles.eyebrow}>SchoolOS Legal</p>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.subtitle}>{subtitle}</p>

        <dl className={styles.meta}>
          <div><dt>Effective date</dt><dd>{effective}</dd></div>
          <div><dt>Version</dt><dd>{version}</dd></div>
          <div><dt>Operator</dt><dd>Echoblaze</dd></div>
        </dl>

        {summary && summary.length > 0 && (
          <aside className={styles.summary} aria-label="Summary">
            <p className={styles.summaryTitle}>In brief</p>
            <ul className={styles.summaryList}>
              {summary.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
            <p className={styles.summaryNote}>This summary is for convenience only. The full text below is what applies.</p>
          </aside>
        )}

        <nav className={styles.toc} aria-label="Contents">
          <p className={styles.tocTitle}>Contents</p>
          <ol className={styles.tocList}>
            {sections.map((s, i) => (
              <li key={i}>
                <a href={`#section-${i + 1}`}>
                  <span className={styles.tocNum}>{i + 1}.</span> {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div>
          {sections.map((s, i) => (
            <section key={i} id={`section-${i + 1}`} className={styles.section}>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionNum}>{i + 1}.</span> {s.title}
              </h2>

              {s.intro && <p className={styles.text}>{s.intro}</p>}
              {s.paragraphs?.map((p, pi) => <p key={pi} className={styles.text}>{p}</p>)}

              {s.items && (
                <ul className={styles.list}>
                  {s.items.map((item, ii) => <li key={ii}>{item}</li>)}
                </ul>
              )}

              {s.groups?.map((g, gi) => (
                <div key={gi}>
                  <h3 className={styles.groupLabel}>{g.label}</h3>
                  <ul className={styles.list}>
                    {g.items.map((item, ii) => <li key={ii}>{item}</li>)}
                  </ul>
                </div>
              ))}

              {s.table && (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>{s.table.head.map((h, hi) => <th key={hi} scope="col">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {s.table.rows.map((row, ri) => (
                        <tr key={ri}>
                          {row.map((cell, ci) => ci === 0
                            ? <th key={ci} scope="row">{cell}</th>
                            : <td key={ci}>{cell}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {s.after?.map((p, pi) => <p key={pi} className={styles.text}>{p}</p>)}

              {s.footer && <p className={styles.note}>{s.footer}</p>}
            </section>
          ))}
        </div>

        <footer className={styles.footer}>
          <div className={styles.footerLinks}>
            <Link href={relatedHref}>{relatedLabel}</Link>
            <Link href="/login">Sign in</Link>
            <Link href="/">Home</Link>
          </div>
          <p className={styles.copyright}>© 2026 Echoblaze. SchoolOS. Built in Nigeria.</p>
        </footer>
      </main>
    </div>
  )
}
