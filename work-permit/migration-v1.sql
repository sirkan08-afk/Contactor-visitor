-- Work Permit additive migration v1
-- Apply ONLY after reviewing. Does not touch Patrol or Contractor Registration V8.
begin;

alter table public.work_permits
  add column if not exists applicant_name text,
  add column if not exists supervisor_name text,
  add column if not exists work_type text,
  add column if not exists tools text,
  add column if not exists tracking_token_hash text;

-- Public submissions are created only by the Edge Function using service role.
-- NULL created_by is therefore allowed for QR-originated requests; existing rows remain unchanged.
alter table public.work_permits alter column created_by drop not null;

create unique index if not exists work_permits_tracking_token_hash_uidx
  on public.work_permits (tracking_token_hash)
  where tracking_token_hash is not null;

create table if not exists public.work_permit_department_approvals (
  id uuid primary key default gen_random_uuid(),
  permit_id uuid not null references public.work_permits(id) on delete cascade,
  department text not null,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','revision_requested')),
  comment text,
  actor_id uuid references auth.users(id),
  acted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (permit_id, department)
);

create index if not exists work_permit_department_approvals_permit_idx
  on public.work_permit_department_approvals(permit_id);

alter table public.work_permit_department_approvals enable row level security;

drop policy if exists "Staff view department approvals" on public.work_permit_department_approvals;
create policy "Staff view department approvals"
on public.work_permit_department_approvals for select to authenticated
using (public.current_user_role() in ('ADMIN','SAFETY','SECURITY','ENGINEERING','AREA_OWNER'));

drop policy if exists "Staff update department approvals" on public.work_permit_department_approvals;
create policy "Staff update department approvals"
on public.work_permit_department_approvals for update to authenticated
using (
  public.current_user_role() = 'ADMIN'
  or (
    public.current_user_role() = department
    and status = 'pending'
  )
)
with check (
  public.current_user_role() = 'ADMIN'
  or public.current_user_role() = department
);

commit;
