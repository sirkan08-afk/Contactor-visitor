# Work Permit Online — isolated development branch

Branch: work-permit-online

This work is isolated under work-permit/ and does not modify Patrol or Contractor Registration V8.

## Current files
- work-permit/index.html — responsive Thai request, tracking, and staff approval interface.
- work-permit/migration-v1.sql — additive SQL migration for applicant/supervisor fields, tracking hash, department approvals, staff visibility, and overall status synchronization.
- work-permit/schema-audit.sql — read-only schema audit.
- work-permit/deployment-checklist.md — deployment prerequisites and role checks.
- supabase/functions/work-permit-public/index.ts — public QR submit and private tracking Edge Function.

## Current progress
- UI shell and Supabase client integration: prepared.
- Public QR submission: Edge Function source prepared; not deployed.
- Tracking: secure token hash lookup source prepared; not deployed.
- Department approval routing: initial routing logic prepared; hotel routing rules must be confirmed.
- Staff approval UI: prepared against department approval table.
- Overall status sync: SQL trigger included in migration.
- Inspector screen: 16-item checklist with Yes/No/Not applicable selections prepared.
- Photo evidence UI: multiple image capture/upload with local preview and print appendix prepared.
- Print-to-PDF layout: inspector checklist and photo appendix interface prepared; original two-page permit form integration still pending.
- Inspection persistence: NOT connected to database yet; do not treat browser preview as saved evidence.

## Deployment safety
Nothing in this branch has been applied to the production Supabase database. Do not enable the live QR link until the migration and Edge Function are reviewed, applied, deployed, and tested with staff accounts.

Before applying migration-v1.sql:
1. Confirm the complete existing work_permits status CHECK allows submitted, approved, rejected, and revision_requested. If not, adjust it carefully without losing existing states.
2. Confirm exact role values in user_roles and current_user_role().
3. Confirm routing by work type with Security, Safety, Engineering, and Area Owner.
4. Test with real staff accounts and verify existing Work Permit records remain readable.
5. Deploy the Edge Function with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as server-side secrets only.

Never expose a service-role key in browser code or grant anon direct SELECT/INSERT on work_permits.
