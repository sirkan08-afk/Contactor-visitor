# Contractor Visitor V8 — 30-day automatic retention

## Included changes
- ID-card and vehicle-registration photos are optional. Users may still take or upload either image independently.
- Records are retained for 30 full days from the original `created_at` timestamp.
- A scheduled Supabase Edge Function removes expired image files from the private `contractor-private` bucket, then deletes their `contractor_entries` rows.
- The schedule runs daily at 00:15 Thailand time.

## One-time Supabase setup required

The GitHub Pages site cannot run a reliable background cleanup while nobody has the page open. The cleanup therefore runs on Supabase.

1. In Supabase Dashboard, open **Edge Functions** and create a function named `cleanup-contractor-data`.
2. Paste the code from `supabase/functions/cleanup-contractor-data/index.ts` and deploy it.
3. In that function's **Secrets** settings, add `CRON_SECRET` with a long random value (at least 32 characters). Keep it private.
4. In the function settings, turn **Verify JWT** off. The function independently verifies the private `x-cron-secret` header; do not make the function public without this check.
5. Open **SQL Editor**. Copy `supabase/cleanup-retention.sql`, replace the secret placeholder with the exact same value used for `CRON_SECRET`, then run the SQL once.
6. Confirm the SQL reports a scheduled job named `contractor-retention-cleanup`.

The Edge Function uses Supabase's server-provided `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment variables. Never put the service-role key in the website or GitHub Pages.

## Retention rule
The expiry test is `created_at < now() - interval '30 days'`. Updating a record's checkout time does not reset its age. The function removes Storage files before deleting the database row; if Storage removal fails, it leaves the row for a later retry.

## Test
After deployment, invoke the Edge Function manually with a POST request and the `x-cron-secret` header. It should return JSON containing `success`, `cutoff`, `deleted_records`, and `deleted_image_files`. Do not test by inserting fake old production records.
