-- READ ONLY: inspect the existing Work Permit schema before any migration.
-- Run in Supabase SQL Editor. This script does not create, alter, or delete data.

-- 1) Existing columns and defaults.
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'work_permits',
    'work_permit_workers',
    'work_permit_approvals',
    'work_permit_checklists',
    'work_permit_security_links',
    'work_permit_department_approvals',
    'work_permit_inspection_photos'
  )
order by table_name, ordinal_position;

-- 2) Foreign keys between Work Permit tables.
select
  tc.table_name,
  kcu.column_name,
  ccu.table_name as foreign_table_name,
  ccu.column_name as foreign_column_name,
  tc.constraint_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.constraint_schema = kcu.constraint_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
 and ccu.constraint_schema = tc.constraint_schema
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema = 'public'
  and tc.table_name like 'work_permit%'
order by tc.table_name, tc.constraint_name;

-- 3) CHECK constraints, especially the permitted work_permits.status values.
select
  c.conrelid::regclass as table_name,
  c.conname as constraint_name,
  pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.contype = 'c'
  and c.connamespace = 'public'::regnamespace
  and c.conrelid::regclass::text like '%work_permit%'
order by table_name, constraint_name;

-- 4) Existing role values. Confirms exact strings expected by current_user_role().
select role, count(*) as account_count
from public.user_roles
group by role
order by role;

-- 5) Existing RLS policies for Work Permit tables and user_roles.
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and (tablename like 'work_permit%' or tablename = 'user_roles')
order by tablename, policyname;

-- 6) Existing triggers on Work Permit tables.
select
  t.tgname as trigger_name,
  c.relname as table_name,
  pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname like 'work_permit%'
  and not t.tgisinternal
order by c.relname, t.tgname;

-- 7) Check whether the private inspection evidence bucket already exists.
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'work-permit-inspections';
