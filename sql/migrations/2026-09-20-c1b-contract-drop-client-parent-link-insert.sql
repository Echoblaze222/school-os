-- =====================================================================
-- C1-B (CONTRACT): remove the browser's ability to insert parent links
--
-- Status: NOT APPLIED. Apply ONLY AFTER the C1 application code is deployed
-- and a parent has been confirmed to link a child through the new server
-- route. Applying it earlier breaks the old LinkChildPrompt, which inserts
-- into parent_student_links directly from the browser.
--
-- After this, parent_student_links rows can only be created by service_role
-- (public.link_parent_by_code, the create-user routes). That is what makes
-- the separate link code meaningful: without it, a parent could still insert
-- a link to any same-school student UUID and skip the code entirely.
--
-- This also completes the remaining C3 gap; C3 will re-verify it.
-- =====================================================================

drop policy if exists "parents can link children" on public.parent_student_links;

-- private.can_link_student() is no longer referenced by any policy. It is left
-- in place (harmless, not exposed) so this migration is trivially reversible:
--   create policy "parents can link children" on public.parent_student_links
--     for insert to authenticated
--     with check (parent_id = (select auth.uid()) and private.can_link_student(student_id));
