# SchoolOS - Permission Matrix (Phase 1, §25)

Every Phase 2 dashboard lane implements against this table. Actions:
View, Create, Edit, Approve, Publish, Assign, Export, Delete, Manage.

Rule for reading this table: a checkmark means "may perform this action
within their own scope" - never school-wide by default. Scope is defined
per appointment row (see `02-identity-appointments-schema.sql`), not
implied by the title. Principal is the only role with school-wide default
scope, because that's the actual authority a principal role carries.

| Role / Appointment      | View | Create | Edit | Approve | Publish | Assign | Export | Delete | Manage |
|--------------------------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Principal                 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Vice Principal             | ✓ | ✓ | ✓ | ✓ (scoped) | ✓ (scoped) | ✓ (scoped) | ✓ | - | - |
| Secretary                  | ✓ (admin data) | ✓ (enrolment) | ✓ (enrolment) | - | - | - | ✓ | - | - |
| Bursar                     | ✓ (fees) | ✓ (fees) | ✓ (fees) | - | - | - | ✓ (fees) | - | - |
| HOD                        | ✓ (dept) | ✓ (dept) | ✓ (dept) | ✓ (dept results) | - | ✓ (dept) | ✓ (dept) | - | - |
| Examination Officer        | ✓ (results/exams) | ✓ (exams) | ✓ (exams) | ✓ (results) | ✓ (results) | - | ✓ | - | - |
| Counselor                  | ✓ (welfare records, own caseload) | ✓ (welfare notes) | ✓ (own notes) | - | - | - | - | - | - |
| Nurse                      | ✓ (health records) | ✓ (health notes) | ✓ (own notes) | - | - | - | - | - | - |
| Librarian                  | ✓ (library) | ✓ (library) | ✓ (library) | - | - | - | ✓ (library) | ✓ (library) | - |
| ICT Officer                | ✓ (access-code apps, systems) | ✓ (generate codes) | - | ✓ (applications) | - | - | - | - | ✓ (technical) |
| Warden                     | ✓ (assigned hostel) | ✓ (hostel logs) | ✓ (hostel logs) | - | - | - | - | - | - |
| Coach                      | ✓ (assigned team/sport) | ✓ (attendance/records for that activity) | ✓ (own activity) | - | - | - | - | - | - |
| Teacher                    | ✓ (own classes) | ✓ (own classes: attendance, scores) | ✓ (own entries) | - | - | - | ✓ (own classes) | - | - |
| Head Boy / Head Girl / Prefects | ✓ (student-facing, non-record data only) | - | - | - | - | - | - | - | - |
| Student                    | ✓ (own data) | - | - | - | - | - | - | - | - |
| Parent                     | ✓ (own children's data) | - | - | - | - | - | - | - | - |

## Explicit exclusions this phase carries forward (least privilege)

These are the concrete "no implied access" cases the phase doc calls out by
name, made explicit so Phase 2 doesn't have to re-derive them:

- ICT Officer: system/access-code access only. Never counseling records,
  never health records, never academic results.
- Coach: attendance/records for their own assigned activity only. Never
  academic results outside that.
- Hostel Prefect: hostel attendance for their assigned hostel only. Never
  full hostel attendance across the school, never academic data.
- Counselor / Nurse: their own caseload notes only, never each other's
  records, never shared with teachers by default.

## Open item - confirm with user before Phase 2

Per the phase doc: whether Principal and Bursar should stay
admin-issued-only (excluded from the ICT self-service application list).
Default assumed here: yes, excluded - both roles carry financial/full-school
authority, so self-service application for them is out of scope regardless
of ICT review. Flagging as the phase doc itself does, not deciding
unilaterally.
