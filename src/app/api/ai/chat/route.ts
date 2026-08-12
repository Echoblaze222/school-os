// app/api/ai/chat/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenAI } from '@google/genai'

// ─── Clients ────────────────────────────────────────────────────────────────
// NOTE: @google/generative-ai was retired by Google (EOL Nov 30 2025). This
// route now uses the current unified SDK, @google/genai.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function getGemini() {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not set')
  return new GoogleGenAI({ apiKey: key })
}

// ─── Error classifier ────────────────────────────────────────────────────────
// Returns true for any error that should trigger Gemini fallback
function isClaudeQuotaOrOverloadError(err: any): boolean {
  const status = err?.status ?? err?.statusCode ?? err?.error?.status
  const type   = err?.error?.type ?? err?.type ?? ''
  const msg    = (err?.message ?? '').toLowerCase()

  // Anthropic HTTP status codes
  if (status === 429) return true   // rate limit / quota
  if (status === 529) return true   // overloaded
  if (status === 503) return true   // service unavailable

  // Anthropic error type strings
  if (type === 'overloaded_error')     return true
  if (type === 'rate_limit_error')     return true
  if (type === 'quota_exceeded')       return true

  // Fallback: message-based detection
  if (msg.includes('overload'))              return true
  if (msg.includes('rate limit'))            return true
  if (msg.includes('quota'))                 return true
  if (msg.includes('529'))                   return true
  if (msg.includes('too many requests'))     return true
  if (msg.includes('credit balance is too low')) return true  // 400 billing error
  if (msg.includes('plans & billing'))           return true  // same error variant

  return false
}

// ─── Normalised response shape ───────────────────────────────────────────────
type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; name: string; input: any }

interface NormalisedResponse {
  content:    ContentBlock[]
  model_used: 'claude' | 'gemini'
}

// ─── Agent tools (generic registry) ───────────────────────────────────────
// Every AI action across every role is defined ONCE here as an entry in
// AGENT_TOOLS. Adding a new capability later means adding one entry to
// this array (+ a small "load draft" effect on the relevant dashboard
// page) — nothing else in this file needs to change.
//
// SAFETY MODEL: no tool here writes real data. Every one of them saves a
// row to `ai_action_drafts` (school/user-scoped by RLS) and hands back a
// [[label|href]] link into the *existing* dashboard page for that action.
// A human reviews and clicks the real Save/Publish button there — that's
// what actually creates the announcement/quiz/etc. This is deliberate:
// content going out school-wide, or touching real records, should always
// have a human in the loop, never be auto-published by the model.
interface AgentTool {
  name:        string
  roles:       string[]           // which roles see this tool
  actionType:  string             // stored in ai_action_drafts.action_type
  description: string
  schema: {                       // Claude input_schema / Gemini parameters (same shape)
    type: 'object'
    properties: Record<string, any>
    required: string[]
  }
  // Where the review page lives for each role that can use this tool.
  reviewPath: (role: string, draftId: string) => string
  // Cheap structural validation before we trust the model's tool call —
  // NOT business-rule validation (that still happens in the real page's
  // own Save flow, same as if a human typed it).
  validate: (input: any) => boolean
}

const AGENT_TOOLS: AgentTool[] = [
  {
    name:        'draft_quiz_from_note',
    roles:       ['teacher'],
    actionType:  'quiz',
    description:
      'Create a draft quiz (title + questions) generated from one of this teacher\'s notes. ' +
      'This does NOT publish a real quiz — it only saves a draft the teacher will review and edit ' +
      'inside the Quizzes page before anything is actually created. Only call this when the teacher ' +
      'has clearly asked you to generate/create quiz questions from a specific note, and only using a ' +
      'note_id that appears in the "This teacher\'s notes" section of your context.',
    schema: {
      type: 'object',
      properties: {
        note_id: { type: 'string', description: 'The note_id of the source note, exactly as given in context.' },
        title:   { type: 'string', description: 'A short quiz title, e.g. "Photosynthesis Quiz".' },
        questions: {
          type: 'array',
          minItems: 3,
          maxItems: 20,
          items: {
            type: 'object',
            properties: {
              question: { type: 'string' },
              options:  { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 6 },
              answer:   { type: 'string', description: 'Must exactly match one of the options.' },
              marks:    { type: 'number' },
            },
            required: ['question', 'options', 'answer', 'marks'],
          },
        },
      },
      required: ['note_id', 'title', 'questions'],
    },
    reviewPath: (_role, id) => `/dashboard/teacher/quizzes?draftId=${id}`,
    validate: (input) => {
      const { note_id, title, questions } = input ?? {}
      return !!note_id && !!title && Array.isArray(questions) && questions.length > 0 &&
        questions.every((q: any) =>
          typeof q?.question === 'string' &&
          Array.isArray(q?.options) && q.options.length >= 2 &&
          typeof q?.answer === 'string' &&
          typeof q?.marks === 'number'
        )
    },
  },
  {
    name:        'draft_announcement',
    roles:       ['principal', 'teacher', 'secretary'],
    actionType:  'announcement',
    description:
      'Draft a school announcement. This does NOT publish it — it only saves a draft the user will ' +
      'review inside the Announcements/Notices page and click Post themselves. Only call this when the user ' +
      'has clearly asked you to write/create/draft an announcement, and always write the full body ' +
      'text yourself based on what they told you, not a placeholder.',
    schema: {
      type: 'object',
      properties: {
        title:    { type: 'string', description: 'Short announcement title.' },
        body:     { type: 'string', description: 'The full announcement text.' },
        audience: {
          type: 'string',
          enum: ['all', 'teachers', 'students', 'parents', 'staff'],
          description: 'Who this announcement is for.',
        },
      },
      required: ['title', 'body', 'audience'],
    },
    reviewPath: (role, id) => {
      if (role === 'principal') return `/dashboard/principal/announcements?draftId=${id}`
      if (role === 'secretary') return `/dashboard/secretary/notices?draftId=${id}`
      return `/dashboard/teacher/announcements?draftId=${id}`
    },
    validate: (input) => {
      const { title, body, audience } = input ?? {}
      return !!title && !!body &&
        ['all', 'teachers', 'students', 'parents', 'staff'].includes(audience)
    },
  },
  {
    name:        'draft_fee_reminder_message',
    roles:       ['bursar'],
    actionType:  'fee_reminder',
    description:
      'Draft the WORDING of a fee reminder message. This does NOT send anything and does NOT pick ' +
      'recipients — it only saves a draft message the bursar will load into the Fee Reminders page, ' +
      'where they still manually select which debtor(s) to send it to and click Send themselves. ' +
      'Never claim in your reply that a message has been sent — it has not.',
    schema: {
      type: 'object',
      properties: {
        title:   { type: 'string', description: 'A short internal label for this draft, e.g. "Term 2 overdue reminder".' },
        message: { type: 'string', description: 'The full reminder message body, addressed to a parent/guardian.' },
      },
      required: ['title', 'message'],
    },
    reviewPath: (_role, id) => `/dashboard/bursar/reminders?draftId=${id}`,
    validate: (input) => !!input?.title && !!input?.message,
  },
]

function toolsForRole(role: string): AgentTool[] {
  return AGENT_TOOLS.filter(t => t.roles.includes(role))
}

function anthropicToolSchema(t: AgentTool) {
  return { name: t.name, description: t.description, input_schema: t.schema }
}
function geminiToolSchema(t: AgentTool) {
  return { name: t.name, description: t.description, parameters: t.schema }
}

// ─── System prompt factory ───────────────────────────────────────────────────
function buildSystemPrompt(role: string, profile: any): string {
  const schoolName = profile?.school_name ?? 'your school'
  const userName   = profile?.full_name   ?? 'there'

  // ── Shared platform knowledge (injected for every role) ──────────────────
  const platformKnowledge = `
## SchoolOS — Platform Overview
SchoolOS is a multi-role school management SaaS platform built for Nigerian schools.
It runs on a subscription model and serves six user roles: Principal, Teacher, Bursar, Secretary, Student, and Parent.

### Authentication & Access Codes
- Every school is registered by a Principal who gets a unique **School Code** (e.g. SCH-XXXX).
- When a school admin (Secretary) creates a user account, the system generates a **one-time access code**.
- New users sign in at /auth/login, enter their school code + access code, and are prompted to set a permanent password on first login.
- Forgot password sends a reset link via email; the user is redirected to /auth/reset-password.
- Sessions auto-expire after 30 minutes of inactivity (configurable by Principal).

### Onboarding Stages (Principal flow)
After a school is registered, the Principal must complete onboarding in order:
  1. **School Profile** — school name, logo, address, primary colour.
  2. **Academic Setup** — set current session/term, class levels (JSS1–SS3 or custom).
  3. **Fee Structures** — define fee items (Tuition, PTA levy, etc.) per class level.
  4. **Staff Accounts** — Secretary creates teacher, bursar, and other staff accounts.
  5. **Student Enrolment** — Secretary adds students; system generates student access codes.
  6. **Parent Linking** — Parents sign up and link to a child via the child's student ID.
Skipping a stage may cause downstream features (fee invoices, class assignments, quizzes) to malfunction.

### Roles & Dashboard Structure
Each role has its own dashboard with a bottom navigation bar and the following pages:

**Principal Dashboard**
- Overview (KPI cards: enrolment, revenue, attendance, pending fees)
- Students (view all students, filter by class)
- Staff (view all staff, manage roles)
- Finance (fee summary, collection rates, outstanding balances)
- Reports (term reports, performance analytics)
- Settings (school profile, academic year, subscription, theme colour)
- AI Insights (this assistant)

**Teacher Dashboard**
- Overview (my classes, upcoming lessons, recent quiz results)
- Classes (assigned subjects and class levels)
- Quizzes (create, publish, view results — subjects must be assigned first)
- Attendance (mark daily attendance per class)
- Results (enter/upload scores, view gradebook)
- Messages (send messages to parents or students)
- AI Assistant (this assistant)

**Bursar Dashboard**
- Overview (today's collections, outstanding fees, recent transactions)
- Fee Structures (view structures set by Principal)
- Invoices (auto-generated per student per term from fee structures)
- Record Payment (search student → select invoice → enter amount → confirm)
- Reports (daily/weekly/term collection reports, export to PDF)
- Exchange Rates (set NGN rates for multi-currency schools)
- AI Finance Assistant (this assistant)

**Secretary Dashboard**
- Overview (recent admissions, pending documents, upcoming events)
- Students (add, edit, search students; manage enrolment status)
- Staff (create staff accounts, reset access codes)
- Events (create/manage school calendar events)
- Documents (upload/manage official school documents)
- Behaviour Records (log student behaviour incidents)
- AI Admin Assistant (this assistant)

**Student Dashboard**
- Overview (my classes, upcoming quizzes, recent scores)
- Subjects (list of assigned subjects)
- Quizzes (attempt published quizzes from teachers)
- Results (view my scores and reports)
- Timetable (weekly class schedule)
- Fees (view my invoices and payment status)
- AI Study Assistant (this assistant)

**Parent Dashboard**
- Overview (child's attendance summary, fee status, recent results)
- My Child (switch between linked children if multiple)
- Fees (view child's invoices, payment history)
- Results (view child's academic performance)
- Attendance (view child's attendance record)
- Messages (communicate with teachers/school)
- AI Parent Assistant (this assistant)

### Fee Workflow (end-to-end)
1. Principal sets up **Fee Structures** in Settings → Fees (items + amounts per class).
2. At the start of each term, invoices are **auto-generated** for every enrolled student based on their class-level fee structure.
3. Bursar opens **Invoices**, searches for a student, and records a payment against the invoice.
4. A **receipt** is generated automatically and can be downloaded as PDF.
5. Parents can see their child's invoice and payment status in the Parent dashboard → Fees tab.
6. Outstanding balances appear on the Bursar and Principal dashboards.

### Quiz Workflow
1. Teacher must first be **assigned to a subject and class** (done by Principal/Secretary in Staff settings).
2. Teacher goes to Quizzes → Create Quiz → selects subject + class level.
3. Teacher adds questions (MCQ or short answer), sets time limit, and publishes.
4. Published quizzes appear in the Student dashboard → Quizzes tab.
5. Students attempt the quiz; results are auto-graded for MCQ.
6. Teacher views results in Quizzes → Results.

### Subscription & Trial
- New schools get a **14-day free trial** on registration.
- After trial expiry, the Principal must subscribe via Settings → Subscription.
- Payment is via Paystack (card or bank transfer).
- Expired subscription restricts access to most features until renewed.
`.trim()

  // ── Step-by-step response format ──────────────────────────────────────────
  // Applies to every role. When answering a "how do I..." / navigation
  // question, the assistant should reply with a numbered walkthrough where
  // each step that corresponds to a real screen ends with a deep-link marker
  // in the form [[Button label|/exact/route]]. The client
  // (UniversalAIPage.tsx) parses this marker and renders a tappable button
  // that navigates straight to that screen — instead of the person having to
  // find it themselves. Only use routes from the map below; never invent one.
  const stepFormatInstruction = `
## Response format for "how do I..." / navigation questions
When the question is about how to do something in the app, answer as a
numbered list of short steps. For any step where the action happens on a
specific SchoolOS screen, end that step's line with a deep-link marker:
  1. Open Settings [[Go to Settings|/dashboard/principal/settings]]
  2. Click "Academic Setup" and select the current term
Only use exact routes from "Your available routes" below — never invent a
route. Steps that are actions within a screen (e.g. "click Save") don't need
a marker. Keep each step to one short sentence. For questions that aren't
about navigating the app (explanations, drafting text, general advice),
respond normally in prose — don't force the numbered/link format.
`.trim()

  const ROUTE_MAP: Record<string, Record<string, string>> = {
    principal: {
      'Staff':           '/dashboard/principal/staff',
      'Students':        '/dashboard/principal/students',
      'Teachers':        '/dashboard/principal/teachers',
      'Classes':         '/dashboard/principal/classes',
      'Access Codes':    '/dashboard/principal/codes',
      'Analytics':       '/dashboard/principal/analytics',
      'Results':         '/dashboard/principal/results',
      'Fees':            '/dashboard/principal/fees',
      'Assignments':     '/dashboard/principal/assignments',
      'Live Classes':    '/dashboard/principal/live',
      'Meetings':        '/dashboard/principal/meetings',
      'Announcements':   '/dashboard/principal/announcements',
      'Notices':         '/dashboard/principal/notices',
      'Notifications':   '/dashboard/principal/notifications',
      'Reports':         '/dashboard/principal/reports',
      'Subscriptions':   '/dashboard/principal/subscriptions',
      'Alumni':          '/dashboard/principal/alumni',
      'Transfers':       '/dashboard/principal/transfers',
      'Messages':        '/dashboard/principal/chat',
      'Profile':         '/dashboard/principal/profile',
      'AI Insights':     '/dashboard/principal/ai',
      'Settings':        '/dashboard/principal/settings',
    },
    teacher: {
      'My Classes':      '/dashboard/teacher/classes',
      'Attendance':      '/dashboard/teacher/attendance',
      'Assignments':     '/dashboard/teacher/assignments',
      'Grades':          '/dashboard/teacher/grades',
      'Messages':        '/dashboard/teacher/chat',
      'AI Assistant':    '/dashboard/teacher/ai',
      'Live Class':      '/dashboard/teacher/live',
      'Quizzes':         '/dashboard/teacher/quizzes',
      'Results':         '/dashboard/teacher/results',
      'Study Notes':     '/dashboard/teacher/notes',
      'Timetable':       '/dashboard/teacher/timetable',
      'Syllabus':        '/dashboard/teacher/syllabus',
      'Announcements':   '/dashboard/teacher/announcements',
      'Audit Log':       '/dashboard/teacher/audit',
      'Meetings':        '/dashboard/teacher/meetings',
      'My Profile':      '/dashboard/teacher/profile',
      'Notifications':   '/dashboard/teacher/notifications',
      'Submissions':     '/dashboard/teacher/submissions',
    },
    bursar: {
      'Fee Records':      '/dashboard/bursar/fees',
      'Record Payment':   '/dashboard/bursar/record-payment',
      'Payment Claims':   '/dashboard/bursar/claims',
      'Payments':         '/dashboard/bursar/payments',
      'Invoices':         '/dashboard/bursar/invoices',
      'Receipts':         '/dashboard/bursar/receipts',
      'Expenses':         '/dashboard/bursar/expenses',
      'Reports':          '/dashboard/bursar/reports',
      'Debtors':          '/dashboard/bursar/debtors',
      'Reminders':        '/dashboard/bursar/reminders',
      'Export Data':      '/dashboard/bursar/export',
      'History':          '/dashboard/bursar/history',
      'Messages':         '/dashboard/bursar/chat',
      'Notifications':    '/dashboard/bursar/notifications',
      'AI Assistant':     '/dashboard/bursar/ai',
      'Meetings':         '/dashboard/bursar/meetings',
      'Settings':         '/dashboard/bursar/settings',
    },
    secretary: {
      'Students':        '/dashboard/secretary/students',
      'Admissions':      '/dashboard/secretary/admissions',
      'Applications':    '/dashboard/secretary/applications',
      'Transfers':       '/dashboard/secretary/transfers',
      'Users':           '/dashboard/secretary/users',
      'Records':         '/dashboard/secretary/records',
      'Documents':       '/dashboard/secretary/documents',
      'Notices':         '/dashboard/secretary/notices',
      'Notifications':   '/dashboard/secretary/notifications',
      'Calendar':        '/dashboard/secretary/calendar',
      'Access Codes':    '/dashboard/secretary/codes',
      'Messages':        '/dashboard/secretary/chat',
      'AI Assistant':    '/dashboard/secretary/ai',
      'Meetings':        '/dashboard/secretary/meetings',
      'Settings':        '/dashboard/secretary/settings',
    },
    student: {
      'Assignments':     '/dashboard/student/assignments',
      'Timetable':       '/dashboard/student/timetable',
      'Live Classes':    '/dashboard/student/classes',
      'Results':         '/dashboard/student/results',
      'Quizzes':         '/dashboard/student/quizzes',
      'Notes':           '/dashboard/student/notes',
      'AI Tutor':        '/dashboard/student/ai',
      'Messages':        '/dashboard/student/chat',
      'Study Plan':      '/dashboard/student/schedule',
      'Meetings':        '/dashboard/student/meetings',
      'Records':         '/dashboard/student/records',
      'Syllabus':        '/dashboard/student/syllabus',
      'Alumni':          '/dashboard/student/alumni',
      'My ID Card':      '/dashboard/student/id-card',
      'Leaderboard':     '/dashboard/student/leaderboard',
      'Notice Board':    '/dashboard/student/announcements',
      'Notifications':   '/dashboard/student/notifications',
    },
    parent: {
      "Child's Profile": '/dashboard/parent/child',
      'Results':         '/dashboard/parent/results',
      'Fee Status':      '/dashboard/parent/fees',
      'Attendance':      '/dashboard/parent/attendance',
      'Assignments':     '/dashboard/parent/assignments',
      'Timetable':       '/dashboard/parent/timetable',
      'Leaderboard':     '/dashboard/parent/leaderboard',
      'Meetings':        '/dashboard/parent/meetings',
      'Message School':  '/dashboard/parent/chat',
      'AI Assistant':    '/dashboard/parent/ai',
      'Notifications':   '/dashboard/parent/notifications',
    },
  }

  function formatRouteMap(role: string): string {
    const routes = ROUTE_MAP[role] ?? {}
    const lines = Object.entries(routes).map(([label, href]) => `- ${label}: ${href}`)
    return `## Your available routes (use these exact paths in [[label|route]] markers)\n${lines.join('\n')}`
  }

  // ── Role-specific prompt ──────────────────────────────────────────────────
  const rolePrompts: Record<string, string> = {

    principal: `
You are the SchoolOS AI Insights Assistant for ${userName}, the Principal of ${schoolName}.

Your job is to help the Principal manage, analyse, and improve their school using SchoolOS.
You are an expert school administrator and education consultant with deep knowledge of Nigerian schools.

### What you can help with:
- **Navigation**: Guide the Principal to any feature step by step (e.g. "Go to Settings → Academic Setup → then click 'New Term'").
- **Onboarding**: Walk through all 6 onboarding stages in order if the school is new.
- **Data analysis**: Help interpret KPI cards on the dashboard (enrolment trends, revenue, attendance).
- **Staff management**: Explain how to create staff accounts, assign roles, reset access codes.
- **Fee setup**: Walk through creating fee structures and how they link to student invoices.
- **Reports**: Help generate and interpret term reports.
- **Settings**: Guide through school profile, theme, academic year, and subscription settings.
- **Communication**: Draft formal letters, circulars, staff memos, parent notices.
- **School improvement**: Offer evidence-based strategies for Nigerian secondary schools.

### Tone: Professional, direct, solution-oriented. Use numbered steps for procedures.
`.trim(),

    teacher: `
You are the SchoolOS AI Teaching Assistant for ${userName}, a Teacher at ${schoolName}.

Your job is to help teachers use SchoolOS efficiently and support their classroom practice.

### What you can help with:
- **Navigation**: Guide to any Teacher dashboard feature step by step.
- **Quiz creation**: Walk through creating a quiz — remind the teacher they must be assigned to a subject first. Steps: Quizzes → Create Quiz → select subject/class → add questions → set timer → Publish.
- **Attendance**: Guide to Classes → Attendance → select class → mark present/absent → Save.
- **Results entry**: Guide to Results → select class/subject → enter scores → Save.
- **Lesson planning**: Generate detailed lesson plans (topic, objectives, introduction, activities, assessment) aligned to WAEC/NECO/JAMB standards.
- **Quiz questions**: Generate MCQ or short-answer questions on any subject/topic.
- **Student messages**: Draft professional messages to parents about student progress.
- **Report comments**: Write end-of-term report card comments.
- **Teaching strategies**: Suggest engaging classroom activities for Nigerian school contexts.

### Tone: Collegial, practical, encouraging. Use numbered steps for app procedures.
`.trim(),

    bursar: `
You are the SchoolOS AI Finance Assistant for ${userName}, the Bursar of ${schoolName}.

Your job is to help the Bursar manage school finances using SchoolOS and provide financial guidance.

### What you can help with:
- **Navigation**: Guide to any Bursar dashboard feature step by step.
- **Recording payments**: Steps: Invoices → search student name → open invoice → click "Record Payment" → enter amount and payment method → Confirm → receipt auto-generated.
- **Fee structures**: Explain that fee structures are set by the Principal; Bursar can view but not edit them.
- **Reports**: Guide to Reports → select date range or term → Export PDF.
- **Outstanding balances**: Explain how to identify students with unpaid fees from the dashboard overview.
- **Exchange rates**: Guide to Exchange Rates page if the school uses multi-currency.
- **Fee reminders**: Draft professional SMS/email reminders to parents about outstanding fees.
- **Financial reports**: Write term financial summaries and collection reports.
- **Best practices**: Advise on fee collection strategies, payment plans for families in difficulty.

### Tone: Professional, precise, helpful. Use numbered steps for app procedures.
`.trim(),

    secretary: `
You are the SchoolOS AI Admin Assistant for ${userName}, the Secretary of ${schoolName}.

Your job is to help the Secretary manage records, communications, and administration in SchoolOS.

### What you can help with:
- **Navigation**: Guide to any Secretary dashboard feature step by step.
- **Adding students**: Steps: Students → Add Student → fill in name, class, date of birth, guardian info → Save → system generates student access code → share code with student/parent.
- **Creating staff accounts**: Steps: Staff → Add Staff → enter name, email, role (Teacher/Bursar/etc.) → Save → system generates access code → share with staff member.
- **Resetting access codes**: Staff or Students list → find user → Actions → Reset Access Code.
- **Events**: Events → Create Event → fill in title, date, description, audience → Publish.
- **Documents**: Documents → Upload → select file → add title and category → Save.
- **Behaviour records**: Behaviour → New Record → select student → describe incident → severity → Save.
- **Correspondence**: Draft admission letters, acceptance letters, suspension letters, circulars, certificates of good conduct, parent notices.
- **Enrolment checklists**: Provide step-by-step onboarding checklists for new students.
- **Calendar planning**: Help structure a school term calendar.

### Tone: Organised, professional, thorough. Use numbered steps for app procedures.
`.trim(),

    student: `
You are the SchoolOS AI Study Assistant for ${userName}, a student at ${schoolName}.

Your job is to help students understand their subjects, prepare for exams, and use SchoolOS.

### What you can help with:
- **Navigation**: Guide to any Student dashboard feature (Quizzes, Results, Timetable, Fees).
- **Attempting quizzes**: Quizzes tab → find published quiz → click Start → answer questions → Submit before timer runs out.
- **Viewing results**: Results tab → select subject or term → view scores.
- **Viewing fees**: Fees tab → see current invoices and payment status.
- **All academic subjects**: Mathematics, English Language, Physics, Chemistry, Biology, Geography, History, Government, Economics, Literature, Yoruba/Igbo/Hausa, Agricultural Science, Technical Drawing, Computer Science, and more.
- **Curriculum alignment**: WAEC, NECO, JAMB, BECE standards. Use past-question style examples.
- **Explanations**: Break down complex topics in simple steps with Nigerian examples.
- **Practice questions**: Generate practice questions on any topic with full worked solutions.
- **Exam strategies**: Time management, answering techniques, how to tackle WAEC essay questions.
- **Study plans**: Create a personalised weekly study timetable.

### Tone: Friendly, encouraging, age-appropriate. Use emojis sparingly. Keep answers clear and structured.
`.trim(),

    parent: `
You are the SchoolOS AI Parent Assistant for ${userName}, a parent at ${schoolName}.

Your job is to help parents monitor their child's education and use SchoolOS effectively.

### What you can help with:
- **Navigation**: Guide to any Parent dashboard feature step by step.
- **Linking a child**: If not already linked — go to My Child → Link Child → enter child's student ID → Confirm.
- **Viewing fees**: My Child → Fees tab → see all invoices, amounts, and payment status.
- **Viewing results**: My Child → Results tab → view subject scores and term reports.
- **Viewing attendance**: My Child → Attendance tab → see daily attendance record.
- **Multiple children**: Use the child switcher at the top of My Child page if you have more than one child enrolled.
- **Communicating with school**: Messages tab → New Message → select recipient (Teacher or School Admin) → write message → Send.
- **Supporting learning at home**: Practical tips to help children study, manage time, and stay motivated.
- **Understanding reports**: Help interpret school report cards and grade scales.
- **Parent-teacher meetings**: Prepare good questions to ask teachers about their child's progress.

### Tone: Warm, supportive, jargon-free. Use simple language. Be empathetic about parenting challenges.
`.trim(),
  }

  const rolePrompt = rolePrompts[role] ?? rolePrompts['student']

  return `${rolePrompt}\n\n---\n\n${stepFormatInstruction}\n\n${formatRouteMap(role)}\n\n---\n\n${platformKnowledge}`
}

// ─── Image attachment shape ───────────────────────────────────────────────────
// Sent by the client as a base64 payload (no "data:...;base64," prefix) plus
// its mime type. Kept optional everywhere so text-only chat is unaffected.
interface ImageAttachment { mediaType: string; data: string }

const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
])

// ─── Claude call ─────────────────────────────────────────────────────────────
async function callClaude(
  systemPrompt: string,
  messages: Anthropic.MessageParam[],
  image?: ImageAttachment,
  role?: string
): Promise<NormalisedResponse> {
  let finalMessages = messages

  // Attach the image to the last user turn as a vision content block.
  if (image && SUPPORTED_IMAGE_TYPES.has(image.mediaType)) {
    const last = messages[messages.length - 1]
    if (last && last.role === 'user') {
      finalMessages = [
        ...messages.slice(0, -1),
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: image.mediaType as any, data: image.data },
            },
            { type: 'text', text: typeof last.content === 'string' ? last.content : '' },
          ],
        },
      ]
    }
  }

  const agentTools = toolsForRole(role ?? '')
  const tools = agentTools.map(anthropicToolSchema)
  const response = await anthropic.messages.create({
    model:      'claude-sonnet-4-20250514',
    max_tokens: 1536,
    system:     systemPrompt,
    messages:   finalMessages,
    ...(tools.length ? { tools } : {}),
  })

  const content: ContentBlock[] = response.content.map((b): ContentBlock | null => {
    if (b.type === 'text') return { type: 'text', text: b.text }
    if (b.type === 'tool_use') return { type: 'tool_use', name: b.name, input: b.input }
    return null
  }).filter((b): b is ContentBlock => b !== null)

  return { content, model_used: 'claude' }
}

// ─── Gemini call ─────────────────────────────────────────────────────────────
async function callGemini(
  systemPrompt: string,
  messages: Array<{ role: string; content: string }>,
  image?: ImageAttachment,
  role?: string
): Promise<NormalisedResponse> {
  const ai = getGemini()

  // Convert to Gemini history format (all but the last message)
  const history = messages.slice(0, -1).map(m => ({
    role:  m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  const agentTools = toolsForRole(role ?? '')
  const tools = agentTools.length
    ? [{ functionDeclarations: agentTools.map(geminiToolSchema) }]
    : undefined

  const chat = ai.chats.create({
    model:   'gemini-3.6-flash',
    history,
    config:  { systemInstruction: systemPrompt, ...(tools ? { tools } : {}) },
  })

  const lastMsg = messages[messages.length - 1]

  // Gemini also accepts inline image parts alongside the text prompt.
  const messageParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> =
    image && SUPPORTED_IMAGE_TYPES.has(image.mediaType)
      ? [{ inlineData: { mimeType: image.mediaType, data: image.data } }, { text: lastMsg.content }]
      : [{ text: lastMsg.content }]

  const response = await chat.sendMessage({ message: messageParts as any })

  const content: ContentBlock[] = []
  if (response.text) content.push({ type: 'text', text: response.text })
  for (const call of response.functionCalls ?? []) {
    if (call.name) content.push({ type: 'tool_use', name: call.name, input: call.args ?? {} })
  }

  return { content, model_used: 'gemini' }
}

// ─── Live school data context ──────────────────────────────────────────────
// Pulls a lightweight, role-scoped snapshot of the school's real data
// (enrolment, attendance, results, fees) and injects it into the system
// prompt so the AI can actually analyse the school instead of guessing.
//
// SECURITY: every query below is scoped using values that came from the
// user's OWN profile row (fetched server-side via their authenticated
// session) — never from anything the client sent in the request body. A
// principal at School A can only ever pull School A's numbers; a student
// or parent can only ever pull their own / their linked child's records.
// This mirrors the same school_id-scoping pattern used throughout the rest
// of the dashboard (see e.g. src/app/dashboard/principal/page.tsx).
async function fetchDataContext(
  supabase: any,
  role: string,
  effectiveUserId: string,
  profile: any
): Promise<string> {
  const schoolId = profile?.school_id
  if (!schoolId) return ''

  try {
    if (role === 'principal' || role === 'secretary') {
      const [
        { count: studentCount },
        { count: teacherCount },
        { count: classCount },
        { data: results },
        { data: feeRows },
        { data: attendanceRows },
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true })
          .eq('school_id', schoolId).eq('role', 'student'),
        supabase.from('profiles').select('*', { count: 'exact', head: true })
          .eq('school_id', schoolId).eq('role', 'teacher'),
        supabase.from('classes').select('*', { count: 'exact', head: true })
          .eq('school_id', schoolId),
        supabase.from('results').select('score, max_score')
          .eq('school_id', schoolId).limit(500),
        supabase.from('school_fees').select('amount_ngn, paid_ngn')
          .eq('school_id', schoolId),
        supabase.from('attendance').select('status, is_present')
          .eq('school_id', schoolId).limit(1000),
      ])

      const scores = (results ?? [])
        .map((r: any) => (r.max_score ? (r.score / r.max_score) * 100 : r.score))
        .filter((s: any) => typeof s === 'number' && !isNaN(s))
      const avgScore = scores.length
        ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length)
        : null

      const feeTotals = (feeRows ?? []).reduce(
        (acc: { due: number; paid: number }, r: any) => {
          acc.due  += Number(r.amount_ngn) || 0
          acc.paid += Number(r.paid_ngn)   || 0
          return acc
        },
        { due: 0, paid: 0 }
      )
      const collectionRate = feeTotals.due > 0
        ? Math.round((feeTotals.paid / feeTotals.due) * 100) : null

      const attRows = attendanceRows ?? []
      const presentCount = attRows.filter((a: any) => a.status === 'present' || a.is_present === true).length
      const attendanceRate = attRows.length
        ? Math.round((presentCount / attRows.length) * 100) : null

      return `
## Live School Data (fetched just now for this conversation — use these real numbers, don't invent your own)
- Students enrolled: ${studentCount ?? 'unknown'}
- Teachers: ${teacherCount ?? 'unknown'}
- Classes: ${classCount ?? 'unknown'}
- Average result score: ${avgScore !== null ? `${avgScore}%` : 'no results recorded yet'}
- Fee collection rate: ${collectionRate !== null ? `${collectionRate}% (₦${feeTotals.paid.toLocaleString()} collected of ₦${feeTotals.due.toLocaleString()} due)` : 'no fee records yet'}
- Attendance rate (recent records sampled): ${attendanceRate !== null ? `${attendanceRate}%` : 'no attendance records yet'}
`.trim()
    }

    if (role === 'bursar') {
      const [{ data: feeRows }, { data: invoices }] = await Promise.all([
        supabase.from('school_fees').select('amount_ngn, paid_ngn').eq('school_id', schoolId),
        supabase.from('fee_invoices').select('status, amount_due, amount_paid').eq('school_id', schoolId).limit(1000),
      ])
      const feeTotals = (feeRows ?? []).reduce(
        (acc: { due: number; paid: number }, r: any) => {
          acc.due  += Number(r.amount_ngn) || 0
          acc.paid += Number(r.paid_ngn)   || 0
          return acc
        },
        { due: 0, paid: 0 }
      )
      const outstandingCount = (invoices ?? []).filter((i: any) => i.status !== 'paid').length

      return `
## Live School Finance Data (fetched just now — use these real numbers, don't invent your own)
- Total due: ₦${feeTotals.due.toLocaleString()}
- Total collected: ₦${feeTotals.paid.toLocaleString()}
- Outstanding balance: ₦${(feeTotals.due - feeTotals.paid).toLocaleString()}
- Invoices not yet fully paid: ${outstandingCount}
`.trim()
    }

    if (role === 'teacher') {
      const [{ data: myClasses }, { data: notes }] = await Promise.all([
        supabase.from('class_teachers')
          .select('class_id, subject, classes ( name, class_level )')
          .eq('teacher_id', effectiveUserId).eq('school_id', schoolId),
        supabase.from('school_notes')
          .select('id, title, description, content, file_url')
          .eq('uploaded_by', effectiveUserId).eq('school_id', schoolId)
          .order('created_at', { ascending: false }).limit(15),
      ])

      const classList = (myClasses ?? [])
        .map((c: any) => `${c.classes?.name ?? 'Unnamed class'}${c.subject ? ` (${c.subject})` : ''}`)
        .join(', ') || 'none assigned yet'

      // Only notes with actual typed text (content/description) can be used
      // to draft quiz questions — a note that's just an uploaded PDF/file
      // has no text here for the model to read.
      const readableNotes = (notes ?? []).filter((n: any) => (n.content || n.description)?.trim())
      const notesBlock = readableNotes.length
        ? readableNotes.map((n: any) => {
            const text = (n.content || n.description || '').slice(0, 3000)
            return `### Note "${n.title}" (note_id: ${n.id})\n${text}`
          }).join('\n\n')
        : 'None of this teacher\'s notes have readable text content yet (they may be uploaded as files/PDFs, which can\'t be read here) — if asked to draft a quiz from a note, say so rather than inventing content.'

      return `
## Live Teaching Data (fetched just now — use these real details, don't invent your own)
- Classes/subjects assigned to this teacher: ${classList}

## This teacher's notes (usable as quiz source material via the draft_quiz_from_note tool)
${notesBlock}
`.trim()
    }

    if (role === 'student') {
      const [{ data: results }, { data: attendanceRows }] = await Promise.all([
        supabase.from('results').select('score, max_score')
          .eq('student_id', effectiveUserId).eq('school_id', schoolId).limit(100),
        supabase.from('attendance').select('status, is_present')
          .eq('student_id', effectiveUserId).eq('school_id', schoolId).limit(200),
      ])
      const scores = (results ?? [])
        .map((r: any) => (r.max_score ? (r.score / r.max_score) * 100 : r.score))
        .filter((s: any) => typeof s === 'number' && !isNaN(s))
      const avgScore = scores.length
        ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : null
      const attRows = attendanceRows ?? []
      const presentCount = attRows.filter((a: any) => a.status === 'present' || a.is_present === true).length
      const attendanceRate = attRows.length ? Math.round((presentCount / attRows.length) * 100) : null

      return `
## Live Student Data (fetched just now for this student — use these real numbers, don't invent your own)
- Average score across recorded results: ${avgScore !== null ? `${avgScore}%` : 'no results recorded yet'}
- Attendance rate: ${attendanceRate !== null ? `${attendanceRate}%` : 'no attendance records yet'}
`.trim()
    }

    if (role === 'parent') {
      const { data: links } = await supabase
        .from('parent_student_links')
        .select('student_id, profiles:student_id ( full_name )')
        .eq('parent_id', effectiveUserId)

      const childIds = (links ?? []).map((l: any) => l.student_id)
      if (childIds.length === 0) return ''

      const [{ data: results }, { data: attendanceRows }] = await Promise.all([
        supabase.from('results').select('student_id, score, max_score')
          .in('student_id', childIds).eq('school_id', schoolId).limit(300),
        supabase.from('attendance').select('student_id, status, is_present')
          .in('student_id', childIds).eq('school_id', schoolId).limit(600),
      ])

      const perChild = (links ?? []).map((l: any) => {
        const cScores = (results ?? [])
          .filter((r: any) => r.student_id === l.student_id)
          .map((r: any) => (r.max_score ? (r.score / r.max_score) * 100 : r.score))
          .filter((s: any) => typeof s === 'number' && !isNaN(s))
        const avg = cScores.length
          ? Math.round(cScores.reduce((a: number, b: number) => a + b, 0) / cScores.length) : null
        const cAtt = (attendanceRows ?? []).filter((a: any) => a.student_id === l.student_id)
        const present = cAtt.filter((a: any) => a.status === 'present' || a.is_present === true).length
        const attRate = cAtt.length ? Math.round((present / cAtt.length) * 100) : null
        const name = l.profiles?.full_name ?? 'Child'
        return `- ${name}: average score ${avg !== null ? `${avg}%` : 'no results yet'}, attendance ${attRate !== null ? `${attRate}%` : 'no records yet'}`
      }).join('\n')

      return `
## Live Data for Linked Children (fetched just now — use these real numbers, don't invent your own)
${perChild}
`.trim()
    }

    return ''
  } catch (err: any) {
    // Never let a data-fetch hiccup take down the whole AI response —
    // just answer without the live-data section this one time.
    console.warn('[AI] fetchDataContext failed:', err?.message ?? err)
    return ''
  }
}

// ─── Route handler ───────────────────────────────────────────────────────────
// Per-role request budget. Staff roles get a slightly higher ceiling than
// students/parents since bursar/principal workflows can be message-heavy.
const RATE_LIMIT_WINDOW_SECONDS = 60
const RATE_LIMIT_PER_ROLE: Record<string, number> = {
  principal: 30, teacher: 30, bursar: 30, secretary: 30,
  student:   20, parent:  20,
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { messages, userId, schoolId, systemContext, role, image, conversationId } = await req.json()

    if (!messages?.length) {
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 })
    }

    // The route only ever acts on behalf of the authenticated caller —
    // never trust a userId the client might pass for someone else.
    const effectiveUserId = user.id
    if (userId && userId !== effectiveUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Resolve role — client may send it as `role` or `systemContext`
    const resolvedRole = (role ?? systemContext ?? 'student').toLowerCase()

    // ── High-traffic protection: atomic DB-backed rate limit ─────────────────
    // Works correctly across every serverless instance (unlike an in-memory
    // counter), since the check-and-increment happens inside one Postgres
    // function call.
    const perRoleLimit = RATE_LIMIT_PER_ROLE[resolvedRole] ?? 20
    const { data: allowed, error: rateErr } = await supabase.rpc('ai_check_rate_limit', {
      p_user_id:        effectiveUserId,
      p_limit:          perRoleLimit,
      p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
    })
    if (rateErr) {
      // Fail open — a rate-limit outage should never take the assistant down.
      console.warn('[AI] Rate limit check failed, allowing request:', rateErr.message)
    } else if (allowed === false) {
      return NextResponse.json(
        {
          error:       'You\'re sending messages too fast. Please wait a moment and try again.',
          retry_after: RATE_LIMIT_WINDOW_SECONDS,
        },
        { status: 429, headers: { 'Retry-After': String(RATE_LIMIT_WINDOW_SECONDS) } }
      )
    }

    // Normalise message roles (handle legacy 'model' role from old client versions)
    const formattedMessages: Array<{ role: 'user' | 'assistant'; content: string }> =
      messages.map((m: any) => ({
        role:    m.role === 'model' ? 'assistant' : m.role,
        content: m.content,
      }))

    const imageAttachment: ImageAttachment | undefined =
      image?.data && image?.mediaType ? { data: image.data, mediaType: image.mediaType } : undefined

    // Fetch user profile for personalisation
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, class_level, school_id, role')
      .eq('id', effectiveUserId)
      .single()

    const systemPrompt = buildSystemPrompt(resolvedRole, profile)
    const dataContext  = await fetchDataContext(supabase, resolvedRole, effectiveUserId, profile)
    const finalSystemPrompt = dataContext
      ? `${systemPrompt}\n\n---\n\n${dataContext}`
      : systemPrompt

    // ── Try Claude first, fall back to Gemini on quota/overload ──────────────
    let result: NormalisedResponse
    let usedFallback = false

    try {
      result = await callClaude(finalSystemPrompt, formattedMessages, imageAttachment, resolvedRole)
    } catch (claudeErr: any) {
      if (isClaudeQuotaOrOverloadError(claudeErr)) {
        console.warn('[AI] Claude unavailable — falling back to Gemini. Reason:', claudeErr?.message)
        usedFallback = true
        try {
          result = await callGemini(finalSystemPrompt, formattedMessages, imageAttachment, resolvedRole)
        } catch (geminiErr: any) {
          console.error('[AI] Gemini fallback also failed:', geminiErr?.message)
          return NextResponse.json(
            { error: 'AI service temporarily unavailable. Please try again shortly.' },
            { status: 503 }
          )
        }
      } else {
        // Not a quota/overload error — re-throw so the outer catch handles it
        throw claudeErr
      }
    }

    // ── Execute any agent tool calls (generic — see AGENT_TOOLS above) ───────
    // The model may respond with a tool_use block instead of / alongside text.
    // Every tool here does the same thing: validate → save ONE draft row to
    // ai_action_drafts → hand back a [[label|href]] button into the real
    // dashboard page. No tool call ever writes real data directly.
    const resolvedSchoolId = schoolId ?? profile?.school_id
    for (const block of result.content) {
      if (block.type !== 'tool_use') continue

      const tool = AGENT_TOOLS.find(t => t.name === block.name && t.roles.includes(resolvedRole))
      if (!tool) continue // model called something it shouldn't have access to — ignore it

      if (!tool.validate(block.input)) {
        result.content.push({ type: 'text', text: `\n\n(I tried to draft that but the details came out incomplete — could you ask me again?)` })
        continue
      }

      const { title, ...rest } = block.input
      const noteId = typeof rest.note_id === 'string' ? rest.note_id : null

      try {
        const { data: draft, error: draftErr } = await supabase
          .from('ai_action_drafts')
          .insert({
            school_id:   resolvedSchoolId,
            user_id:     effectiveUserId,
            role:        resolvedRole,
            action_type: tool.actionType,
            note_id:     noteId,
            title,
            payload:     rest,
          })
          .select('id')
          .single()

        if (draftErr) throw draftErr

        const summary = tool.actionType === 'quiz' && Array.isArray(rest.questions)
          ? `**${rest.questions.length} questions** titled "${title}"`
          : `"${title}"`

        result.content.push({
          type: 'text',
          text: `\n\n✅ I've drafted ${summary}. Nothing has been published yet — review and edit it, then publish from there.\n\n1. Review the draft [[Review & Publish|${tool.reviewPath(resolvedRole, draft.id)}]]`,
        })
      } catch (toolErr: any) {
        console.error(`[AI] Failed to save ${tool.actionType} draft:`, toolErr?.message ?? toolErr)
        result.content.push({ type: 'text', text: `\n\n(I put that together but couldn't save the draft — please try again.)` })
      }
    }

    // Flatten to the single text string the client renders (tool_use blocks
    // never reach the client directly — only the text/marker we built above).
    const combinedText = result.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()
    result = { ...result, content: [{ type: 'text', text: combinedText }] }

    // ── Persist conversation + messages (real history, not just a cache) ────
    const lastUserMessage  = formattedMessages[formattedMessages.length - 1]
    let resolvedConversationId: string | null = conversationId ?? null

    try {
      if (!resolvedConversationId) {
        // Find the live (non-archived) conversation for this user+role, or start one.
        const { data: existing } = await supabase
          .from('ai_conversations')
          .select('id')
          .eq('user_id', effectiveUserId)
          .eq('role_context', resolvedRole)
          .eq('is_archived', false)
          .maybeSingle()

        if (existing) {
          resolvedConversationId = existing.id
        } else {
          const { data: created, error: createErr } = await supabase
            .from('ai_conversations')
            .insert({
              user_id:      effectiveUserId,
              school_id:    resolvedSchoolId,
              role_context: resolvedRole,
              title:        lastUserMessage?.content?.slice(0, 60) ?? 'New conversation',
            })
            .select('id')
            .single()
          if (createErr) throw createErr
          resolvedConversationId = created?.id ?? null
        }
      }

      if (resolvedConversationId) {
        await supabase.from('ai_messages').insert([
          {
            conversation_id: resolvedConversationId,
            role:            'user',
            content:         lastUserMessage?.content ?? '',
            image_url:       imageAttachment ? `data:${imageAttachment.mediaType};base64,${imageAttachment.data}` : null,
          },
          {
            conversation_id: resolvedConversationId,
            role:            'assistant',
            content:         result.content[0].text,
            model_used:      result.model_used,
          },
        ])

        await supabase
          .from('ai_conversations')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', resolvedConversationId)
      }
    } catch (persistErr: any) {
      // Persistence issues should never block the reply reaching the user.
      console.warn('[AI] Failed to persist conversation history:', persistErr?.message ?? persistErr)
    }

    // Return normalised response — client reads data.content[0].text
    return NextResponse.json({
      ...result,
      fallback_used:   usedFallback,
      conversation_id: resolvedConversationId,
    })

  } catch (err: any) {
    console.error('[AI] Unhandled error:', err)
    return NextResponse.json(
      { error: err?.message ?? 'AI service error' },
      { status: 500 }
    )
  }
}