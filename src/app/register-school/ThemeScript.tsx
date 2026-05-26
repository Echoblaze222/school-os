// src/app/ThemeScript.tsx
// Inline script that runs BEFORE React hydration to prevent theme flash
// Include this in your root layout <head> or at the top of <body>

export function ThemeScript() {
  const script = `
    (function() {
      try {
        var theme = localStorage.getItem('schoolos_theme') || 'dark';
        document.documentElement.setAttribute('data-theme', theme);
      } catch(e) {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    })();
  `
  return (
    <script
      dangerouslySetInnerHTML={{ __html: script }}
      suppressHydrationWarning
    />
  )
}
