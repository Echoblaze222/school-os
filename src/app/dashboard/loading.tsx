// src/app/dashboard/loading.tsx
//
// Next.js automatically wraps every route segment in a Suspense boundary
// keyed to its loading.tsx, and shows it INSTANTLY on navigation while the
// destination page.tsx (a server component) finishes fetching its data.
// There was no loading.tsx anywhere in the app, so every nav click froze
// the screen with no feedback until the new page's data was fully ready.
//
// This one file covers all 273 pages under /dashboard/*, since Next.js
// cascades a loading.tsx down to every nested route unless a more specific
// one overrides it for a particular page.
export default function DashboardLoading() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-base, #080C14)',
        zIndex: 50,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: '3px solid var(--brand-subtle, rgba(128,0,32,0.12))',
          borderTopColor: 'var(--brand, #800020)',
          animation: 'dashboard-loading-spin 0.7s linear infinite',
        }}
      />
      <style>{`
        @keyframes dashboard-loading-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
