# SchoolOS Notification System Audit and Plan

Research-driven review of how notifications work today against how mature notification systems work in 2026.
Covers the in-app center (bell), the push pipeline, the database, and what is still open.

## The standard a real notification system meets

1. **A persistent inbox you can trust.** Per-recipient read state, an accurate unread count, consistent across devices.
2. **Instant, optimistic UI.** Mark-read updates immediately and rolls back if the server rejects it.
3. **Live sync.** New items appear without a refetch, and read state set on one device shows on the others.
4. **Grouping.** Time groups (Today, Yesterday, Earlier) and bundling repeated events so the feed scans instead of floods.
5. **Reachable destinations.** Every item opens the exact valid screen, with a safe fallback.
6. **User control.** Per-category preferences, honoured by every channel, with critical alerts exempt.
7. **Push as the urgent channel.** High priority for urgent items, TTL so stale alerts expire, dead tokens pruned, no duplicate sends.
8. **Designed states.** Loading, empty, error, offline, and accessible by keyboard and screen reader.

## What was already good

- Realtime hook with visibility-based reconnect for the backgrounded Android WebView.
- Dedupe key with a unique index, so the same event cannot create two rows.
- Push splits web and Android (FCM) and prunes expired subscriptions.
- Hourly unread digest with backoff, and preference-aware Termii backup (PR #5).

## Findings fixed in this branch

| # | Finding | Fix |
|---|---------|-----|
| 1 | Badge and "N unread" counted only the 20 loaded rows, so 57 unread showed as 20 | Unread count now comes from the server, kept live |
| 2 | Every new notification refetched the list and flashed the loading dots over an open panel | New rows are prepended directly, loading shows only on first load |
| 3 | Items with only `link_url` (and no `action_url`) were dead taps | Both columns are checked |
| 4 | `router.push(action_url)` followed any URL, including outside sites | Only in-app paths are followed, in the bell and in the push link |
| 5 | Mark-read had no rollback: a failed write still showed the item as read | Optimistic update with rollback |
| 6 | Read state from another device or tab never appeared until reload | Realtime UPDATE events sync read state |
| 7 | Bell could not be tapped again to close, no Escape key, no dialog semantics | Toggle, Escape returns focus to the bell, `role=dialog`, `aria-expanded` |
| 8 | No grouping, no error state | Today/Yesterday/Earlier groups, retry state |
| 9 | Type dots used hardcoded hex including a leftover violet | Theme tokens |
| 10 | Push route ignored `notification_preferences.push_enabled` | Explicit mutes honoured, mandatory categories exempt |
| 11 | Internal secret compared with `!==` | Constant-time comparison |

## Open items (need a decision or a database change, not applied)

See `proposed-migration.sql` in this folder. Nothing in it has been run.

1. **Notification spoofing.** The INSERT policy only checks the *sender's* school. It does not check that the *recipient* belongs to that school, so any signed-in user can create a notification for any user id, with any title and link. Proposed policy uses a SECURITY DEFINER helper. Sequenced after PR #5 (your H3/H6 note).
2. **Hardcoded secret in the live trigger function.** The function `push_on_notification_insert` holds the internal secret as a plain literal. Rotate `INTERNAL_SECRET`, then move it to Supabase Vault. Also: the function builds the push link from `action_url` only, ignoring `link_url`.
3. **Redundant indexes** on `notifications` (three overlap with others) add write cost on every insert.
4. **No seen-versus-read state.** The research treats "saw the badge" and "opened the item" as different signals. Needs a `seen_at` column.
5. **No quiet hours or per-category push UI.** The preference table has `push_enabled` and `in_app_enabled`, but PR #5's settings card only exposes backup SMS/WhatsApp. The push route now honours `push_enabled`, so a UI toggle is all that is missing.
6. **No retention.** Old read notifications are never purged.
7. **Two Vercel projects** build this repo. The trigger posts to one of them (`school-os-j4bn`). If production is the other project, push is hitting the wrong deployment.
8. **Bundling** repeated events (for example ten fee reminders in a row) is not implemented yet.
