// src/app/super-admin/content/[id]/page.tsx
// Phase 4, Lane H (§55). One editor for both creating and editing - the
// dynamic segment doubles as the literal string "new" for a fresh post,
// same pattern already used by school-setup style routes elsewhere in
// this app, rather than a separate /content/new route.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ContentEditorClient from './ContentEditorClient'

export default async function ContentEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/super-admin/login')

  const { data: sa } = await supabase
    .from('platform_admins').select('id').eq('id', user.id).single()
  if (!sa) redirect('/login')

  return <ContentEditorClient postId={id} />
}
