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

-- Allow assigned departments to read permits routed to their role.
drop policy if exists "Assigned departments view permits" on public.work_permits;
create policy "Assigned departments view permits"
on public.work_permits for select to authenticated
using (
  public.current_user_role() = 'ADMIN'
  or public.current_user_role() = 'SAFETY'
  or exists (
    select 1 from public.work_permit_department_approvals a
    where a.permit_id = work_permits.id
      and a.department = public.current_user_role()
  )
);

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

-- Recalculate overall permit status after each department decision.
create or replace function public.refresh_work_permit_overall_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  total_count integer;
  approved_count integer;
  rejected_count integer;
  revision_count integer;
begin
  select count(*),
         count(*) filter (where status = 'approved'),
         count(*) filter (where status = 'rejected'),
         count(*) filter (where status = 'revision_requested')
    into total_count, approved_count, rejected_count, revision_count
  from public.work_permit_department_approvals
  where permit_id = new.permit_id;

  if rejected_count > 0 then
    update public.work_permits set status = 'rejected', updated_at = now() where id = new.permit_id;
  elsif revision_count > 0 then
    update public.work_permits set status = 'revision_requested', updated_at = now() where id = new.permit_id;
  elsif total_count > 0 and approved_count = total_count then
    update public.work_permits set status = 'approved', updated_at = now() where id = new.permit_id;
  end if;
  return new;
end;
$$;

drop trigger if exists work_permit_department_status_sync on public.work_permit_department_approvals;
create trigger work_permit_department_status_sync
after insert or update of status on public.work_permit_department_approvals
for each row execute function public.refresh_work_permit_overall_status();

commit;
