// Mounts the desktop sidebar for this page. The page keeps its own header.
import DesktopShellServer from '@/components/DesktopShellServer'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DesktopShellServer role="principal" />
      {children}
    </>
  )
}
