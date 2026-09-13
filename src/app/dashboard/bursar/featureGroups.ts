// src/app/dashboard/bursar/featureGroups.ts
// Shared across every bursar sub-page that uses RoleSubHeader, so the
// bottom dock / "all features" sheet is identical everywhere a bursar
// navigates - not just on the dashboard home screen. Extracted from
// BursarDashboardClient.tsx, which now imports this instead of defining
// its own local copy.

import { FeatureGroup } from '@/components/AllFeaturesSheet'
import {
  WalletIcon, FileTextIcon, BarChartIcon,
  MessageIcon, DownloadIcon, PeopleIcon, ClockIcon,
  CheckCircleIcon, BellIcon, SettingsIcon, CalendarIcon,
  CreditCardIcon, ClipboardIcon, UploadIcon,
} from '@/components/Icons'

export const BURSAR_FEATURE_GROUPS: FeatureGroup[] = [
  { name: 'Finance', items: [
    { id: 'fees',           label: 'Fee records',    href: '/dashboard/bursar/fees',           Icon: WalletIcon },
    { id: 'record-payment', label: 'Record payment', href: '/dashboard/bursar/record-payment', Icon: CreditCardIcon },
    { id: 'claims',         label: 'Payment claims', href: '/dashboard/bursar/claims',         Icon: UploadIcon },
    { id: 'payments',       label: 'Payments',       href: '/dashboard/bursar/payments',       Icon: CheckCircleIcon },
    { id: 'invoices',       label: 'Invoices',       href: '/dashboard/bursar/invoices',       Icon: FileTextIcon },
    { id: 'receipts',       label: 'Receipts',       href: '/dashboard/bursar/receipts',       Icon: ClipboardIcon },
    { id: 'expenses',       label: 'Expenses',       href: '/dashboard/bursar/expenses',       Icon: WalletIcon },
  ]},
  { name: 'Collections', items: [
    { id: 'debtors',   label: 'Debtors',   href: '/dashboard/bursar/debtors',   Icon: PeopleIcon },
    { id: 'reminders', label: 'Reminders', href: '/dashboard/bursar/reminders', Icon: BellIcon },
    { id: 'reports',   label: 'Reports',   href: '/dashboard/bursar/reports',   Icon: BarChartIcon },
    { id: 'export',    label: 'Export data',href: '/dashboard/bursar/export',   Icon: DownloadIcon },
    { id: 'history',   label: 'History',   href: '/dashboard/bursar/history',   Icon: ClockIcon },
  ]},
  { name: 'Communication', items: [
    { id: 'chat',          label: 'Messages',      href: '/dashboard/bursar/chat',          Icon: MessageIcon },
    { id: 'meetings',      label: 'Meetings',      href: '/dashboard/bursar/meetings',      Icon: CalendarIcon },
  ]},
  { name: 'Account', items: [
    { id: 'settings', label: 'Settings', href: '/dashboard/bursar/settings', Icon: SettingsIcon },
  ]},
]
