// src/app/super-admin/layout.tsx
import SuperAdminShell from './SuperAdminShell'

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return <SuperAdminShell>{children}</SuperAdminShell>
}
