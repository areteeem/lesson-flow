# Acceptance Checklist

Use this checklist before shipping a live-mode release.

## Environment

1. `.env.local` has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
2. `VITE_LIVE_TRANSPORT` is set to `supabase` for cross-device testing.
3. Supabase schema from `supabase/schema.sql` is applied to the target project.

## Automated checks

1. Run `npm run ci:check`.
2. Confirm all commands pass:
   - `npm run build`
   - `npm run dsl:validate`
   - `npm run live:smoke`

## Manual host/student flow

1. Start app with `npm run dev`.
2. Open host view and create a live session.
3. Join from another browser/profile/device using the join URL.
4. Verify `join_ack` behavior and roster updates.
5. Advance several blocks and verify students stay in sync.
6. Refresh a student tab and verify reconnect requests sync to current block.
7. Join a new student mid-session and verify late-join snapshot sync.
8. Submit at least one student response and verify it appears in host review.
9. Add manual score override and confirm it persists after host refresh.
10. Use per-task "Clear" and student "Reset Overrides" and confirm persisted overrides are deleted.
11. Export reviewed student CSV and verify final points reflect override-or-auto logic.
12. End the session and verify student client reaches finished state.

## Data sanity (Supabase)

1. `live_events` rows are written during session activity.
2. `live_sessions` snapshot row tracks latest phase and current index.
3. `live_participants` includes active and left participants.
4. `live_responses` stores student task updates.
5. `live_manual_scores` stores host overrides.
