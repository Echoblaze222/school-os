// lib/ripple.ts
// Attach as onMouseDown={ripple(motionStyles)} on any button with the
// `rippleHost` class from dashboard-motion.module.css, passing that same
// imported module in so the ripple picks up its scoped class name.
// Mirrors the ripple behaviour already approved in the static prototypes,
// without repeating the DOM code in every component that wants it.

export function ripple(motionStyles: { readonly [key: string]: string }) {
  return (e: React.MouseEvent<HTMLElement>) => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const el = e.currentTarget
    const rect = el.getBoundingClientRect()
    const size = Math.max(rect.width, rect.height)
    const span = document.createElement('span')
    span.className = motionStyles.ripple
    span.style.width = span.style.height = `${size}px`
    span.style.left = `${e.clientX - rect.left - size / 2}px`
    span.style.top = `${e.clientY - rect.top - size / 2}px`
    el.appendChild(span)
    setTimeout(() => span.remove(), 550)
  }
}
