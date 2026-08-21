// src/lib/notify/notifyParents.ts
// §21: hostel + parent connection. Reuses the EXISTING notifyUser()
// fan-out (in-app + WhatsApp/SMS): nothing new invented for delivery,
// this only finds the right recipients (a student's linked parents via
// `parent_student_links`) and calls it once per parent.
//
// Always sends a fixed, safe message the caller supplies explicitly :
// never forwards raw incident descriptions or internal warden notes.
// "Do not expose internal warden notes or confidential case information
// unless explicitly authorized" (§21) is enforced by construction: this
// function has no parameter for internal notes, so there's nothing to
// leak by accident.

import { createAdminClient } from '@/lib/supabase/admin'
import { notifyUser } from './notifyUser'

export async function notifyParentsOfStudent(input: {
  studentId: string
  schoolId: string
  title: string
  body: string
  type: string
  linkUrl?: string
}): Promise<{ notifiedCount: number }> {
  const adminClient = createAdminClient()

  const { data: links } = await adminClient
    .from('parent_student_links')
    .select('parent_id')
    .eq('student_id', input.studentId)

  const parentIds = (links ?? []).map(l => l.parent_id)
  let notifiedCount = 0

  for (const parentId of parentIds) {
    try {
      await notifyUser({
        recipientId: parentId,
        schoolId: input.schoolId,
        title: input.title,
        body: input.body,
        type: input.type,
        linkUrl: input.linkUrl,
      })
      notifiedCount++
    } catch (e) {
      // One parent's notification failing (bad phone number, etc.)
      // should not block the others or fail the caller's main action.
      console.error(`[notifyParents] failed for parent ${parentId}:`, e)
    }
  }

  return { notifiedCount }
}
