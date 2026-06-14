// DEAD_CODE_CLEANUP.md
// src/app/dashboard/secretary/users/
//
// Issue #22: Three competing client components exist for one page.
// The page.tsx correctly imports SecretaryUsersClient.
// The following two files are SAFE TO DELETE — they are unused dead code:
//
//   - UserManagementClient.tsx  (not imported anywhere)
//   - UsersClient.tsx           (not imported anywhere)
//
// Action: Delete those two files. No logic changes needed.
// The active import is:  import SecretaryUsersClient from './SecretaryUsersClient'
