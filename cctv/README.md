# CCTV Management System

Isolated Hotel Security CCTV module. This branch is based on work-permit-online. Existing root Contractor Registration, Patrol tables, Work Permit tables and shared user_roles are not modified.

## Supabase
1. Review and run supabase-schema.sql in the existing Supabase project's SQL Editor.
2. Assign real Supabase Auth user UUIDs and roles in cctv_user_roles.
3. Configure the existing project publishable/anon key in index.html. Never put service_role in browser code.
4. Test RLS with each account before production.

The SQL creates only cctv_* tables and a private cctv-evidence bucket.
