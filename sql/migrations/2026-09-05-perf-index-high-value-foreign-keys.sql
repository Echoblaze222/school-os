-- 2026-09-05-perf-index-high-value-foreign-keys.sql
--
-- 101 of the 194 unindexed_foreign_keys findings from the Supabase
-- performance advisor, prioritized rather than blindly indexing all
-- 194. Cross-referenced every distinct FK column name against actual
-- .eq()/.order()/.in() usage across the whole app (grep counts, not
-- guesswork): school_id (459 hits), student_id (85), user_id (69),
-- class_id (53), teacher_id (36), profile_id (21), department_id (17),
-- room_id (11), hostel_id/class_subject_id (7 each) account for the
-- overwhelming majority of real filtering. A `created_by`-style "who
-- did this" audit column showed near-zero direct filter usage across
-- ~50 tables - those 93 are deliberately deferred rather than indexed
-- speculatively, since a write-heavy index with no read benefit just
-- recreates the unused_index problem this same advisor already flags
-- 68 times elsewhere.
--
-- The 101 indexed here are the ones with real, measured usage signal:
-- every relationship/scope column (school_id, student_id, class_id,
-- teacher_id, etc.) across every table that had it unindexed, plus a
-- handful of created_by/author_id/sender_id columns that did show
-- real usage in the grep. All additive (create index if not exists),
-- zero behavior change, applied directly via the Supabase migration
-- tool - this file mirrors that in version control per repo convention.

create index if not exists idx_ai_action_drafts_school_id_fk on public.ai_action_drafts (school_id);
create index if not exists idx_appointments_department_id_fk on public.appointments (department_id);
create index if not exists idx_assignment_submissions_student_id_fk on public.assignment_submissions (student_id);
create index if not exists idx_assignments_class_id_fk on public.assignments (class_id);
create index if not exists idx_assignments_class_subject_id_fk on public.assignments (class_subject_id);
create index if not exists idx_assignments_teacher_id_fk on public.assignments (teacher_id);
create index if not exists idx_attendance_teacher_id_fk on public.attendance (teacher_id);
create index if not exists idx_certificate_templates_school_id_fk on public.certificate_templates (school_id);
create index if not exists idx_committee_members_profile_id_fk on public.committee_members (profile_id);
create index if not exists idx_committees_school_id_fk on public.committees (school_id);
create index if not exists idx_counseling_follow_ups_school_id_fk on public.counseling_follow_ups (school_id);
create index if not exists idx_counseling_notes_school_id_fk on public.counseling_notes (school_id);
create index if not exists idx_counseling_sessions_school_id_fk on public.counseling_sessions (school_id);
create index if not exists idx_department_objectives_school_id_fk on public.department_objectives (school_id);
create index if not exists idx_department_reports_school_id_fk on public.department_reports (school_id);
create index if not exists idx_department_schedule_items_school_id_fk on public.department_schedule_items (school_id);
create index if not exists idx_department_tasks_school_id_fk on public.department_tasks (school_id);
create index if not exists idx_exam_attendance_school_id_fk on public.exam_attendance (school_id);
create index if not exists idx_exam_attendance_student_id_fk on public.exam_attendance (student_id);
create index if not exists idx_exam_documents_school_id_fk on public.exam_documents (school_id);
create index if not exists idx_exam_incidents_student_id_fk on public.exam_incidents (student_id);
create index if not exists idx_exam_seating_room_id_fk on public.exam_seating (room_id);
create index if not exists idx_exam_seating_student_id_fk on public.exam_seating (student_id);
create index if not exists idx_exam_timetable_class_subject_id_fk on public.exam_timetable (class_subject_id);
create index if not exists idx_exam_timetable_room_id_fk on public.exam_timetable (room_id);
create index if not exists idx_fee_structures_student_id_fk on public.fee_structures (student_id);
create index if not exists idx_hostel_incidents_hostel_id_fk on public.hostel_incidents (hostel_id);
create index if not exists idx_hostel_incidents_school_id_fk on public.hostel_incidents (school_id);
create index if not exists idx_hostel_incidents_student_id_fk on public.hostel_incidents (student_id);
create index if not exists idx_hostel_leave_requests_school_id_fk on public.hostel_leave_requests (school_id);
create index if not exists idx_hostel_maintenance_requests_room_id_fk on public.hostel_maintenance_requests (room_id);
create index if not exists idx_hostel_maintenance_requests_school_id_fk on public.hostel_maintenance_requests (school_id);
create index if not exists idx_hostel_roll_call_entries_student_id_fk on public.hostel_roll_call_entries (student_id);
create index if not exists idx_hostel_roll_call_sessions_school_id_fk on public.hostel_roll_call_sessions (school_id);
create index if not exists idx_ict_asset_events_school_id_fk on public.ict_asset_events (school_id);
create index if not exists idx_invigilator_assignments_room_id_fk on public.invigilator_assignments (room_id);
create index if not exists idx_invigilator_assignments_school_id_fk on public.invigilator_assignments (school_id);
create index if not exists idx_live_classes_class_id_fk on public.live_classes (class_id);
create index if not exists idx_live_classes_class_subject_id_fk on public.live_classes (class_subject_id);
create index if not exists idx_live_session_participants_user_id_fk on public.live_session_participants (user_id);
create index if not exists idx_messages_room_id_fk on public.messages (room_id);
create index if not exists idx_online_classes_class_subject_id_fk on public.online_classes (class_subject_id);
create index if not exists idx_online_classes_teacher_id_fk on public.online_classes (teacher_id);
create index if not exists idx_online_meetings_school_id_fk on public.online_meetings (school_id);
create index if not exists idx_payment_invoices_school_id_fk on public.payment_invoices (school_id);
create index if not exists idx_payments_school_id_fk on public.payments (school_id);
create index if not exists idx_payments_student_id_fk on public.payments (student_id);
create index if not exists idx_principal_profiles_school_id_fk on public.principal_profiles (school_id);
create index if not exists idx_profiles_class_id_fk on public.profiles (class_id);
create index if not exists idx_quizzes_class_id_fk on public.quizzes (class_id);
create index if not exists idx_quizzes_class_subject_id_fk on public.quizzes (class_subject_id);
create index if not exists idx_quizzes_teacher_id_fk on public.quizzes (teacher_id);
create index if not exists idx_recent_activities_school_id_fk on public.recent_activities (school_id);
create index if not exists idx_report_cards_class_id_fk on public.report_cards (class_id);
create index if not exists idx_report_cards_school_id_fk on public.report_cards (school_id);
create index if not exists idx_results_class_subject_id_fk on public.results (class_subject_id);
create index if not exists idx_scheduled_reminders_user_id_fk on public.scheduled_reminders (user_id);
create index if not exists idx_school_notes_class_id_fk on public.school_notes (class_id);
create index if not exists idx_school_notes_class_subject_id_fk on public.school_notes (class_subject_id);
create index if not exists idx_sports_matches_school_id_fk on public.sports_matches (school_id);
create index if not exists idx_sports_team_members_student_id_fk on public.sports_team_members (student_id);
create index if not exists idx_student_health_profiles_student_id_fk on public.student_health_profiles (student_id);
create index if not exists idx_student_leaderboard_class_id_fk on public.student_leaderboard (class_id);
create index if not exists idx_student_profiles_class_id_fk on public.student_profiles (class_id);
create index if not exists idx_subscriptions_school_id_fk on public.subscriptions (school_id);
create index if not exists idx_syllabus_school_id_fk on public.syllabus (school_id);
create index if not exists idx_syllabus_topics_class_subject_id_fk on public.syllabus_topics (class_subject_id);
create index if not exists idx_timetable_class_id_fk on public.timetable (class_id);
create index if not exists idx_timetable_class_subject_id_fk on public.timetable (class_subject_id);
create index if not exists idx_timetable_teacher_id_fk on public.timetable (teacher_id);
create index if not exists idx_training_attendance_student_id_fk on public.training_attendance (student_id);
create index if not exists idx_training_sessions_school_id_fk on public.training_sessions (school_id);
create index if not exists idx_transcript_requests_school_id_fk on public.transcript_requests (school_id);
create index if not exists idx_transcript_requests_student_id_fk on public.transcript_requests (student_id);
create index if not exists idx_trial_reminders_school_id_fk on public.trial_reminders (school_id);
create index if not exists idx_admission_documents_uploaded_by_fk on public.admission_documents (uploaded_by);
create index if not exists idx_admission_status_events_created_by_fk on public.admission_status_events (created_by);
create index if not exists idx_announcements_author_id_fk on public.announcements (author_id);
create index if not exists idx_announcements_created_by_fk on public.announcements (created_by);
create index if not exists idx_assignments_created_by_fk on public.assignments (created_by);
create index if not exists idx_chat_messages_sender_id_fk on public.chat_messages (sender_id);
create index if not exists idx_class_subjects_subject_id_fk on public.class_subjects (subject_id);
create index if not exists idx_content_posts_author_id_fk on public.content_posts (author_id);
create index if not exists idx_counseling_referrals_student_profile_id_fk on public.counseling_referrals (student_profile_id);
create index if not exists idx_counseling_sessions_student_profile_id_fk on public.counseling_sessions (student_profile_id);
create index if not exists idx_department_objectives_created_by_fk on public.department_objectives (created_by);
create index if not exists idx_department_schedule_items_created_by_fk on public.department_schedule_items (created_by);
create index if not exists idx_department_tasks_created_by_fk on public.department_tasks (created_by);
create index if not exists idx_exam_documents_created_by_fk on public.exam_documents (created_by);
create index if not exists idx_exam_incidents_exam_timetable_id_fk on public.exam_incidents (exam_timetable_id);
create index if not exists idx_exam_sessions_created_by_fk on public.exam_sessions (created_by);
create index if not exists idx_exam_timetable_created_by_fk on public.exam_timetable (created_by);
create index if not exists idx_hostel_incident_attachments_uploaded_by_fk on public.hostel_incident_attachments (uploaded_by);
create index if not exists idx_ict_assets_created_by_fk on public.ict_assets (created_by);
create index if not exists idx_medication_administrations_created_by_fk on public.medication_administrations (created_by);
create index if not exists idx_meetings_created_by_fk on public.meetings (created_by);
create index if not exists idx_payment_invoices_fee_structure_id_fk on public.payment_invoices (fee_structure_id);
create index if not exists idx_school_documents_created_by_fk on public.school_documents (created_by);
create index if not exists idx_school_expenses_created_by_fk on public.school_expenses (created_by);
create index if not exists idx_school_promotions_created_by_fk on public.school_promotions (created_by);
create index if not exists idx_syllabus_topics_created_by_fk on public.syllabus_topics (created_by);
