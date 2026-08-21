// src/app/(public)/find-school/page.tsx
// Public platform (Phase 4, Lane C) - §40 student/parent admission discovery.
// Unauthenticated by design. Full school-profile browsing (ratings,
// programs, photos) is Lane B's scope - this shows just enough
// (name, location, admission fee/deadline) to get someone to "Apply".

import FindSchoolClient from './FindSchoolClient'

export default function FindSchoolPage() {
  return <FindSchoolClient />
}
