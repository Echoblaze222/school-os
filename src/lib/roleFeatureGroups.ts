// lib/roleFeatureGroups.ts
// One place that maps a role to its feature groups, so any surface (the
// legacy RoleNav, StudentNav, the server-mounted shell on bespoke pages) can
// render the same desktop sidebar without each caller importing 14 files.
//
// Each role's featureGroups.ts remains the single source of truth. This file
// only re-exports them by role key.

import type { FeatureGroup } from '@/components/AllFeaturesSheet'
import { PRINCIPAL_FEATURE_GROUPS }   from '@/app/dashboard/principal/featureGroups'
import { VP_FEATURE_GROUPS }          from '@/app/dashboard/vice-principal/featureGroups'
import { TEACHER_FEATURE_GROUPS }     from '@/app/dashboard/teacher/featureGroups'
import { STUDENT_FEATURE_GROUPS }     from '@/app/dashboard/student/featureGroups'
import { PARENT_FEATURE_GROUPS }      from '@/app/dashboard/parent/featureGroups'
import { BURSAR_FEATURE_GROUPS }      from '@/app/dashboard/bursar/featureGroups'
import { SECRETARY_FEATURE_GROUPS }   from '@/app/dashboard/secretary/featureGroups'
import { COUNSELOR_FEATURE_GROUPS }   from '@/app/dashboard/counselor/featureGroups'
import { NURSE_FEATURE_GROUPS }       from '@/app/dashboard/nurse/featureGroups'
import { LIBRARIAN_FEATURE_GROUPS }   from '@/app/dashboard/librarian/featureGroups'
import { COACH_FEATURE_GROUPS }       from '@/app/dashboard/coach/featureGroups'
import { HOSTEL_FEATURE_GROUPS }      from '@/app/dashboard/hostel/featureGroups'
import { ICT_FEATURE_GROUPS }         from '@/app/dashboard/ict/featureGroups'
import { EXAMINATION_FEATURE_GROUPS } from '@/app/dashboard/examination/featureGroups'

const REGISTRY: Record<string, FeatureGroup[]> = {
  principal:        PRINCIPAL_FEATURE_GROUPS,
  'vice-principal': VP_FEATURE_GROUPS,
  teacher:          TEACHER_FEATURE_GROUPS,
  student:          STUDENT_FEATURE_GROUPS,
  parent:           PARENT_FEATURE_GROUPS,
  bursar:           BURSAR_FEATURE_GROUPS,
  secretary:        SECRETARY_FEATURE_GROUPS,
  counselor:        COUNSELOR_FEATURE_GROUPS,
  nurse:            NURSE_FEATURE_GROUPS,
  librarian:        LIBRARIAN_FEATURE_GROUPS,
  coach:            COACH_FEATURE_GROUPS,
  hostel:           HOSTEL_FEATURE_GROUPS,
  ict:              ICT_FEATURE_GROUPS,
  examination:      EXAMINATION_FEATURE_GROUPS,
}

export function getFeatureGroups(role: string): FeatureGroup[] | null {
  return REGISTRY[role] ?? null
}
