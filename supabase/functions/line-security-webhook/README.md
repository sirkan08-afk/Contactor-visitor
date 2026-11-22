# LINE Security Webhook (initial safe intake)

Deploy this function to the existing Patrol + Work Permit Supabase project:
`nldoneixnuapuzpeeznl`.

## What it does
- Verifies LINE's `x-line-signature` against the raw request body using `LINE_CHANNEL_SECRET`.
- Accepts text messages from group/room sources only.
- Ignores short acknowledgements (รับทราบ, OK, ขอบคุณ, etc.).
- Routes "แจ้งเพื่อทราบ" to the Security Logbook review inbox.
- Marks "ตรวจพื้นที่" and "มีผู้รับเหมาเข้าทำ" as source-system references only; it does not create duplicate Patrol or Contractor transactions.
- Sends unclear messages to manual review.
- Uses LINE webhook event IDs for deduplication.

This first version uses deterministic keyword rules, not an external AI model. AI classification can be added after the intake is verified and an AI provider key is deliberately configured as a server secret.

## Required database setup
Run `supabase/functions/line-security-webhook/setup.sql` in the SQL Editor of project `nldoneixnuapuzpeeznl`.

## Required Edge Function secrets
Add `LINE_CHANNEL_SECRET` in Supabase Dashboard > Edge Functions > Secrets. Use the Channel Secret from LINE Developers. Never put it in GitHub, browser code, or chat.

Supabase automatically provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the function.

## Deploy
Deploy the folder as function name `line-security-webhook`.
Set the function's JWT verification to OFF because LINE sends signed webhook requests, not Supabase Auth JWTs. The function independently verifies LINE's HMAC signature.

Webhook URL:
`https://nldoneixnuapuzpeeznl.supabase.co/functions/v1/line-security-webhook`

After deployment, paste that URL into LINE Developers > Messaging API > Webhook URL, save it, then enable Use webhook and run Verify.

## Important
- Do not reissue or expose Channel access tokens in chat. The webhook signature uses Channel Secret, not Channel access token.
- No automatic writes are made to Patrol, Contractor Registration, or Work Permit.
- Review inbox items are not yet promoted to permanent Logbook entries. A staff review/approval screen is the next step.
- The existing daily summary function is not changed in this initial deployment.
