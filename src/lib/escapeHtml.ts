// src/lib/escapeHtml.ts
//
// Escapes text for safe interpolation into HTML (email bodies, etc.).
// Anything a user typed (names, emails) must go through this before being
// placed in an HTML template, or it can inject markup/links into the message.

const MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, ch => MAP[ch])
}
