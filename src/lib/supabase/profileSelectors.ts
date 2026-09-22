// C2 security remediation.
//
// `profiles` also holds nin, nin_number, nin_screenshot_url, nin_verified,
// nin_verified_at, pin_hash, secret_identifier, temp_password, address,
// date_of_birth, signature_url, admission_number, employee_id and
// permanent_student_id. RLS on `profiles` is row-scoped (same school), not
// column-scoped (see profiles_select_merged), so any select('*') - even one
// scoped to the signed-in user's own row with .eq('id', user.id) - pulls
// every one of those columns down from the server. In a Next.js Server
// Component, passing that object as a prop to a 'use client' component
// (e.g. <ProfileClient profile={profile} />) serializes it into the page's
// RSC payload, so it reaches the browser even if the UI never renders it.
//
// SELF_PROFILE_SAFE_COLUMNS is for the extremely common "get my own
// profile + school for this page's header/layout" query used by dozens of
// page.tsx server components across every role. It covers what that
// pattern's client components actually read (name, contact, avatar, role,
// access code, account status) and nothing else. It intentionally excludes
// every sensitive/credential field above, plus fields that are real but
// narrower administrative needs (address, date_of_birth, gender,
// qualification, subject, class_level, employee/admission numbers) - pages
// that genuinely need those should select them explicitly and deliberately
// (as principal/students/StudentsClient.tsx and principal/staff/
// StaffClient.tsx already do), not inherit them from this shared constant.
//
// Usage: supabase.from('profiles').select(`${SELF_PROFILE_SAFE_COLUMNS}, schools(*)`).eq('id', user.id).single()
export const SELF_PROFILE_SAFE_COLUMNS =
  'id, school_id, full_name, email, phone, avatar_url, role, default_code, onboarding_stage, is_active, created_at'
