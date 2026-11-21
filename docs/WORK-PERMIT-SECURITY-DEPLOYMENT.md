# Work Permit public endpoint security deployment checklist

This change is staged on `security-hardening-wp-tracking`. It is not active until the migration and Edge Function are deliberately deployed.

## Scope and safety

- Target Supabase project: `nldoneixnuapuzpeeznl` (Work Permit / Patrol).
- Public actions remain limited to `submit` and `track`.
- Public tracking accepts the Work Permit number only; no tracking code is requested.
- Do not expose `SUPABASE_SECRET_KEYS`, `RATE_LIMIT_SALT`, or the Turnstile secret in browser code, GitHub Pages, screenshots, or client-side configuration.
- Do not apply this migration to the separate Contractor Registration project.

## Before deployment

1. Review the SQL migration `supabase/migrations/202611210001_work_permit_public_rate_limit.sql`.
2. Confirm the Turnstile widget's site key is registered for hostname `sirkan08-afk.github.io`.
3. In Supabase Edge Function secrets for project `nldoneixnuapuzpeeznl`, confirm:
   - `SUPABASE_SECRET_KEYS` contains the server-side `default` secret key in the format expected by the function.
   - `TURNSTILE_SECRET_KEY` is the matching Turnstile secret.
   - `RATE_LIMIT_SALT` is a new, high-entropy random value (at least 32 random bytes), stored only as an Edge Function secret.
4. Generate a salt locally if needed with `openssl rand -hex 32`. Do not paste it into chat or commit it.
5. Confirm from a deployed test invocation that Supabase Edge Functions actually receive a trusted `cf-connecting-ip` header. The function intentionally fails closed with HTTP 503 if this header is absent; it does not fall back to a shared IP bucket.

## Deployment order (only after approval)

1. Apply the SQL migration to the Work Permit Supabase project.
2. Set/verify the three Edge Function secrets above.
3. Deploy `supabase/functions/submit-work-permit/index.ts` to the same project.
4. Keep the existing production function available until the replacement is ready; coordinate the cutover to avoid a gap between RPC migration and function deployment.
5. Do not merge this branch to `main` or deploy GitHub Pages as part of the database/function rollout unless separately approved.

## Verification checklist

- Open the public request form: its Turnstile widget renders when the form is visible.
- Open the public tracking form: its separate Turnstile widget renders when that form is visible.
- Complete a valid public request; verify one Work Permit and its SECURITY pending approval are created.
- Track that permit using only its WP number; verify the response contains only permit number, status, work title, and SECURITY approval status/timestamp.
- Confirm invalid/expired Turnstile tokens are rejected.
- Confirm tracking is limited to 10 successful Turnstile-verified attempts per IP per 10-minute bucket.
- Confirm submission is limited to 5 successful Turnstile-verified attempts per IP per 10-minute bucket.
- Confirm an over-limit request returns HTTP 429.
- Confirm missing `RATE_LIMIT_SALT`, failed RPC, or missing trusted IP header returns HTTP 503 rather than bypassing the limiter.
- Confirm anon/authenticated clients cannot directly read or modify `work_permit_public_rate_limits` or execute the limiter RPC.
- Confirm staff login, staff approvals, existing Work Permit records, Patrol records, and Contractor Registration records remain unchanged.

## Rollback

If the new Edge Function has an issue, redeploy the previously deployed Edge Function source. Do not drop the rate-limit table or function as an emergency step unless database owners have reviewed dependencies. The migration is additive and does not alter existing Work Permit or Patrol rows.
