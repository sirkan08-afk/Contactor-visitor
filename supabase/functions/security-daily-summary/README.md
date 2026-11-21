# Security Daily Summary API

This Edge Function aggregates daily counts from the Contractor Registration, Work Permit, and Security Patrol projects. It returns counts only; no names, ID digits, photos, evidence paths, or other personal data are returned.

## Required Supabase Edge Function secrets

Deploy this function to the Supabase project used by Work Permit and Security Patrol (`nldoneixnuapuzpeeznl`).

Supabase provides the shared project's own URL and keys to Edge Functions as environment variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`). Do not try to create custom secrets with the reserved `SUPABASE_` prefix.

Add only these two custom secrets in the shared project's Edge Function Secrets:

- `CONTRACTOR_SUPABASE_URL` — Contractor project URL
- `CONTRACTOR_SUPABASE_SERVICE_ROLE_KEY` — Contractor project's service-role key

Never place either service-role key in frontend code, GitHub Pages, or chat. Add the Contractor service-role key only in Supabase Dashboard > Edge Functions > Secrets (or via the Supabase CLI secrets command).

## Authorization

The caller must present a valid Supabase Auth access token from the shared project. The function checks `public.user_roles` and permits only `ADMIN` or `SECURITY`.

## Deploy

Deploy as function name `security-daily-summary` in the shared Supabase project. The project must have the Supabase CLI configured or use the Dashboard's function deployment workflow.

## Request

`POST /functions/v1/security-daily-summary`

Headers:
- `Authorization: Bearer <staff-access-token>`
- `Content-Type: application/json`

Body:
`{"date":"YYYY-MM-DD"}` (Thailand local date)

The response contains Contractor totals, Work Permit status counts by submission date, and Patrol log counts. It intentionally does not estimate unvisited checkpoints from an unspecified plan.
