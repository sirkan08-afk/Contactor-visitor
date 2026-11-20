# Work Permit — automatic 7-day retention

Permanently deletes Work Permit records more than 7 full days old, based on `work_permits.created_at`, plus related rows in:
- `work_permit_checklists`
- `work_permit_workers`
- `work_permit_department_approvals`

Does not affect `contractor_entries` or its retention policy.

## One-time Supabase setup
1. Deploy `supabase/functions/cleanup-work-permits/index.ts` as an Edge Function named `cleanup-work-permits`.
2. Add Edge Function secret `CRON_SECRET` with a long random value (at least 32 characters).
3. Set Verify JWT OFF for this function. The function independently checks the private `x-cron-secret` header.
4. In Supabase SQL Editor, run `supabase/work-permit-retention.sql` once after replacing the secret placeholder with the exact same secret.
5. Confirm `work-permit-7-day-retention` appears in Cron jobs.

The schedule runs daily at 00:30 Thailand time. A record becomes eligible after 7 x 24 hours and is deleted on the next scheduled run. Server credentials are used only inside the Edge Function, never in the website.
