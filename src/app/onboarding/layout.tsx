// src/app/onboarding/layout.tsx
// Puts all three onboarding stages on the premium black / premium white
// surface (see src/app/premium-surface.css) and gives the visitor the light/dark
// switch. The stages themselves keep their own markup.
import ThemeToggleFab from '@/components/public/ThemeToggleFab'

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-surface="premium">
      <ThemeToggleFab />
      {children}
    </div>
  )
}
