# Work Permit Online — isolated development branch

Branch: work-permit-online

This work is isolated under work-permit/ and does not modify Patrol or Contractor Registration V8.

## Current implementation
- work-permit/index.html: responsive Thai request form, status-tracking screen shell, staff sign-in, and staff list reader for the existing work_permits table.
- work-permit/schema-audit.sql: read-only SQL to inspect current columns, foreign keys, and triggers.
- Project URL and publishable key are configured in the HTML. Publishable keys are intended for browser use; never place a service-role/secret key in frontend code.

## Important deployment status
The UI has been committed to this branch, but public submission and tracking are intentionally not enabled yet. The existing work_permits.created_by column is NOT NULL and current RLS requires an authenticated CONTRACTOR or ADMIN. Public QR submission therefore needs a carefully designed Edge Function and tracking token, not a direct anonymous INSERT. Do not relax RLS or expose table SELECT to anon.

Before implementing the Edge Function, inspect schema-audit.sql output and confirm created_by foreign keys/defaults/triggers, permit_no generation, and any existing storage buckets/functions. Add applicant_name, supervisor_name, work_type, tools, and secure tracking-token storage only through an additive reviewed migration. Preserve existing rows and all Patrol/V8 objects.

Approvals currently store action/comment/actor_id. Define department-specific approval actions and enforce role checks server-side before enabling approval writes. Test using separate real staff accounts for ADMIN, SAFETY, SECURITY, ENGINEERING, and AREA_OWNER.
