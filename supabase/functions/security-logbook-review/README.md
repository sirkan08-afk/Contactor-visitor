# Security Logbook LINE Inbox

This is a separate review module for the existing Hotel Security Management Portal.

## Behavior
- LINE messages are the only source of entries; the page has no manual-create form.
- Staff must sign in. The Edge Function authorizes only users with `user_roles.role` equal to `ADMIN` or `SECURITY`.
- Messages are read from `line_security_messages` for the selected Bangkok calendar day.
- Only `security_logbook` and `manual_review` destinations are shown.
- Review decisions update the existing inbox row to `approved` or `rejected`, with reviewer ID and timestamp.
- PDF exports include approved messages only: Detailed and Summary.
- No existing Contractor, Work Permit, Patrol, or Daily Summary tables/functions are changed.

## Deploy
1. Deploy `supabase/functions/security-logbook-review/index.ts` to project `nldoneixnuapuzpeeznl` as `security-logbook-review`.
2. Turn **Verify JWT OFF**; the function validates the bearer token itself with Supabase Auth and checks `user_roles`.
3. No additional secrets are required; Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
4. The existing `line_security_messages` table must have been created using `line-security-webhook/setup.sql`.
5. The Portal already links to `https://sirkan08-afk.github.io/Contactor-visitor/logbook/`; replace the existing `logbook/index.html` with this version.

## Important
The initial LINE classifier is keyword-based, not AI. This page does not change that behavior. Messages cannot be fetched retrospectively from LINE; only webhook-delivered messages are available.
