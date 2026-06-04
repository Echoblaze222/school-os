// components/Icons.tsx
// Icon set matching the reference UI (Image 2)
// Consistent 24x24 viewBox, strokeWidth 1.75 default

interface IconProps {
  size?: number
  color?: string
  strokeWidth?: number
  className?: string
}

const ic = (size = 24, color = 'currentColor', sw = 1.75) => ({
  width: size, height: size, viewBox: '0 0 24 24',
  fill: 'none', stroke: color, strokeWidth: sw,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
})

// ── Dashboard / Home ──────────────────────────────────────────
export function HomeIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  )
}

// ── School / Building ─────────────────────────────────────────
export function SchoolIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M3 21h18M5 21V7l7-4 7 4v14"/>
      <path d="M9 21v-4a3 3 0 0 1 6 0v4"/>
      <rect x="9" y="9" width="2" height="3"/>
      <rect x="13" y="9" width="2" height="3"/>
    </svg>
  )
}

// ── People / Group (matches Image 2 people icon) ──────────────
export function PeopleIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}

// ── User / Profile ────────────────────────────────────────────
export function UserIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  )
}

// ── Chat / Message (matches Image 2 chat icon) ────────────────
export function MessageIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  )
}

// ── Video / Live (matches Image 2 video icon) ─────────────────
export function VideoIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <polygon points="23 7 16 12 23 17 23 7"/>
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
    </svg>
  )
}

// ── Bell / Notifications (matches Image 2 bell icon) ─────────
export function BellIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  )
}

// ── Bar Chart / Analytics (matches Image 2 chart icon) ────────
export function BarChartIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6"  y1="20" x2="6"  y2="14"/>
    </svg>
  )
}

// ── Check Circle (matches Image 2 round checkmark) ────────────
export function CheckCircleIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  )
}

// ── Search (matches Image 2 search circle) ────────────────────
export function SearchIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )
}

// ── AI / Sparkle ──────────────────────────────────────────────
export function AiIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z"/>
    </svg>
  )
}

// ── Book / Notes ──────────────────────────────────────────────
export function BookIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>
  )
}

// ── Open Book / Syllabus ──────────────────────────────────────
export function BookOpenIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  )
}

// ── Clipboard / Assignment ────────────────────────────────────
export function ClipboardIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
      <line x1="9" y1="12" x2="15" y2="12"/>
      <line x1="9" y1="16" x2="13" y2="16"/>
    </svg>
  )
}

// ── Clock / Timetable ─────────────────────────────────────────
export function ClockIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  )
}

// ── Calendar ──────────────────────────────────────────────────
export function CalendarIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8"  y1="2" x2="8"  y2="6"/>
      <line x1="3"  y1="10" x2="21" y2="10"/>
    </svg>
  )
}

// ── Trophy / Leaderboard ──────────────────────────────────────
export function TrophyIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <polyline points="8 21 12 17 16 21"/>
      <path d="M4 3h16v2a8 8 0 0 1-16 0V3z"/>
      <line x1="12" y1="17" x2="12" y2="11"/>
      <path d="M4 5C2 5 2 9 2 9a6 6 0 0 0 4 5.6"/>
      <path d="M20 5c2 0 2 4 2 4a6 6 0 0 1-4 5.6"/>
    </svg>
  )
}

// ── Award / Quiz ──────────────────────────────────────────────
export function AwardIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <circle cx="12" cy="8" r="6"/>
      <path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>
    </svg>
  )
}

// ── File / Records ────────────────────────────────────────────
export function FileTextIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  )
}

// ── ID Card ───────────────────────────────────────────────────
export function IdCardIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <rect x="2" y="5" width="20" height="14" rx="2"/>
      <circle cx="8" cy="12" r="2.5"/>
      <path d="M13 9h6M13 12h4M13 15h5"/>
    </svg>
  )
}

// ── Megaphone / Announcement ──────────────────────────────────
export function MegaphoneIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M3 11l19-9-9 19-2-8-8-2z"/>
    </svg>
  )
}

// ── Microphone / Voice ────────────────────────────────────────
export function MicIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8"  y1="23" x2="16" y2="23"/>
    </svg>
  )
}

// ── Stop / Square ─────────────────────────────────────────────
export function StopIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <rect x="3" y="3" width="18" height="18" rx="2"/>
    </svg>
  )
}

// ── Send ──────────────────────────────────────────────────────
export function SendIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  )
}

// ── Sun / Light mode ──────────────────────────────────────────
export function SunIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1"  x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  )
}

// ── Moon / Dark mode ──────────────────────────────────────────
export function MoonIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  )
}

// ── Arrow Back ────────────────────────────────────────────────
export function ArrowLeftIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <line x1="19" y1="12" x2="5" y2="12"/>
      <polyline points="12 19 5 12 12 5"/>
    </svg>
  )
}

// ── Settings / Gear ───────────────────────────────────────────
export function SettingsIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}

// ── Log out ───────────────────────────────────────────────────
export function LogOutIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  )
}

// ── Plus / Add ────────────────────────────────────────────────
export function PlusIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <line x1="12" y1="5" x2="12" y2="19"/>
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  )
}

// ── Dots / More ───────────────────────────────────────────────
export function MoreIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <circle cx="12" cy="5"  r="1" fill={color}/>
      <circle cx="12" cy="12" r="1" fill={color}/>
      <circle cx="12" cy="19" r="1" fill={color}/>
    </svg>
  )
}

// ── Attach / Paperclip ────────────────────────────────────────
export function PaperclipIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
    </svg>
  )
}

// ── Wallet / Fee ──────────────────────────────────────────────
export function WalletIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/>
      <path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/>
      <circle cx="18" cy="14" r="2"/>
    </svg>
  )
}

// ── Layers / Classes ──────────────────────────────────────────
export function LayersIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <polygon points="12 2 2 7 12 12 22 7 12 2"/>
      <polyline points="2 17 12 22 22 17"/>
      <polyline points="2 12 12 17 22 12"/>
    </svg>
  )
}

// ── Globe / Alumni ────────────────────────────────────────────
export function GlobeIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  )
}

// ── Eye / View ────────────────────────────────────────────────
export function EyeIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

export function EyeOffIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

// ── Lock ──────────────────────────────────────────────────────
export function LockIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  )
}

// ── Key ───────────────────────────────────────────────────────
export function KeyIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
    </svg>
  )
}

// ── Phone ─────────────────────────────────────────────────────
export function PhoneIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.18h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.16 6.16l.9-.9a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  )
}

// ── Mail ──────────────────────────────────────────────────────
export function MailIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  )
}

// ── Download ──────────────────────────────────────────────────
export function DownloadIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  )
}

// ── Refresh ───────────────────────────────────────────────────
export function RefreshIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  )
}

// ── Edit / Pencil ─────────────────────────────────────────────
export function EditIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  )
}

// ── Trash ─────────────────────────────────────────────────────
export function TrashIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  )
}

// ── Wifi off / Offline ────────────────────────────────────────
export function WifiOffIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <line x1="1" y1="1" x2="23" y2="23"/>
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
      <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
      <line x1="12" y1="20" x2="12.01" y2="20"/>
    </svg>
  )
}

// ── Flame / Streak ────────────────────────────────────────────
export function FlameIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z"/>
    </svg>
  )
}

// ── Shield / Security ─────────────────────────────────────────
export function ShieldIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  )
}

// ── Image placeholder (matches Image 1 wireframe) ────────────
export function ImageIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  )
}

// ── Camera ────────────────────────────────────────────────────
export function CameraIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  )
}

// ── Upload ────────────────────────────────────────────────────
export function UploadIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  )
}

// ── Emoji / Happy (for reactions) ────────────────────────────
export function SmileIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <circle cx="12" cy="12" r="10"/>
      <path d="M8 13s1.5 2 4 2 4-2 4-2"/>
      <line x1="9"  y1="9"  x2="9.01"  y2="9"/>
      <line x1="15" y1="9"  x2="15.01" y2="9"/>
    </svg>
  )
}

// ── X / Close ─────────────────────────────────────────────────
export function XIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6"  y1="6" x2="18" y2="18"/>
    </svg>
  )
}

// ── Save / Floppy ─────────────────────────────────────────────
export function SaveIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
      <polyline points="17 21 17 13 7 13 7 21"/>
      <polyline points="7 3 7 8 15 8"/>
    </svg>
  )
}

// ── Trending Up ───────────────────────────────────────────────
export function TrendingIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
      <polyline points="17 6 23 6 23 12"/>
    </svg>
  )
}

// ── Trending Up (alias) ───────────────────────────────────────
export function TrendingUpIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
      <polyline points="17 6 23 6 23 12"/>
    </svg>
  )
}

// ── Users (group of people) ───────────────────────────────────
export function UsersIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}

// ── Alert Circle ──────────────────────────────────────────────
export function AlertCircleIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  )
}

// ── Credit Card ───────────────────────────────────────────────
export function CreditCardIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
      <line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  )
}

// ── Chevron Right ─────────────────────────────────────────────
export function ChevronRightIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  )
}

// ── Folder ────────────────────────────────────────────────────
export function FolderIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  )
}

// ── Sparkles / AI ─────────────────────────────────────────────
export function SparklesIcon({ size = 24, color = 'currentColor', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg {...ic(size, color, strokeWidth)}>
      <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z"/>
      <path d="M5 3L4 6l-3 1 3 1 1 3 1-3 3-1-3-1z"/>
      <path d="M19 13l-.7 2.3-2.3.7 2.3.7.7 2.3.7-2.3 2.3-.7-2.3-.7z"/>
    </svg>
  )
}