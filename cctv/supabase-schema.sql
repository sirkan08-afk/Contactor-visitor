-- CCTV Management System | isolated schema for Hotel Security
-- Apply in Supabase SQL Editor. Does not modify existing Patrol / Work Permit tables.
create extension if not exists pgcrypto;

create table if not exists public.cctv_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('ADMIN','SECURITY_MANAGER','SECURITY_OFFICER','CCTV_OPERATOR')),
  display_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cctv_locations (
  id uuid primary key default gen_random_uuid(),
  location_name text not null unique,
  building text,
  floor text,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.cctv_locations(location_name) values
 ('Lobby'),('Parking'),('Swimming Pool'),('Restaurant'),('Back Office'),
 ('Guest Room Corridor'),('Building Exterior'),('Other'),('Staff Area'),('Entrance / Exit')
on conflict (location_name) do nothing;

create table if not exists public.cctv_cameras (
  id uuid primary key default gen_random_uuid(),
  camera_code text not null unique,
  camera_name text not null,
  location_id uuid references public.cctv_locations(id),
  exact_location text,
  camera_type text check (camera_type is null or camera_type in ('DOME','BULLET','PTZ','FISHEYE','OTHER')),
  nvr_name text,
  channel_number text,
  ip_reference text,
  installation_date date,
  operational_status text not null default 'ACTIVE' check (operational_status in ('ACTIVE','INACTIVE','REMOVED')),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cctv_inspections (
  id uuid primary key default gen_random_uuid(),
  camera_id uuid not null references public.cctv_cameras(id),
  inspection_date date not null default (timezone('Asia/Bangkok', now()))::date,
  live_view text not null check (live_view in ('PASS','FAIL','NOT_APPLICABLE')),
  image_quality text not null check (image_quality in ('PASS','FAIL','NOT_APPLICABLE')),
  recording text not null check (recording in ('PASS','FAIL','NOT_APPLICABLE')),
  camera_position text not null check (camera_position in ('PASS','FAIL','NOT_APPLICABLE')),
  date_time_check text not null check (date_time_check in ('PASS','FAIL','NOT_APPLICABLE')),
  connection text not null check (connection in ('PASS','FAIL','NOT_APPLICABLE')),
  result text not null check (result in ('NORMAL','ABNORMAL','OFFLINE')),
  problem_description text,
  evidence_path text,
  inspected_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(camera_id, inspection_date)
);

create table if not exists public.cctv_maintenance (
  id uuid primary key default gen_random_uuid(),
  ticket_no text not null unique,
  camera_id uuid not null references public.cctv_cameras(id),
  problem text not null,
  priority text not null default 'MEDIUM' check (priority in ('LOW','MEDIUM','HIGH','CRITICAL')),
  status text not null default 'OPEN' check (status in ('OPEN','IN_PROGRESS','WAITING_PARTS','COMPLETED','VERIFIED','CANCELLED')),
  reported_by uuid not null references auth.users(id),
  assigned_to text,
  repair_details text,
  repair_evidence_path text,
  reported_at timestamptz not null default now(),
  completed_at timestamptz,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cctv_playback_requests (
  id uuid primary key default gen_random_uuid(),
  request_no text not null unique,
  requester_id uuid not null references auth.users(id),
  requester_name text,
  department text not null,
  purpose text not null,
  camera_id uuid not null references public.cctv_cameras(id),
  incident_at timestamptz not null,
  time_from time not null,
  time_to time not null,
  approval_status text not null default 'PENDING' check (approval_status in ('PENDING','APPROVED','REJECTED','CANCELLED')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  approval_note text,
  handled_by uuid references auth.users(id),
  handling_status text not null default 'NOT_STARTED' check (handling_status in ('NOT_STARTED','IN_PROGRESS','COMPLETED','UNAVAILABLE')),
  export_made boolean not null default false,
  retention_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (time_to > time_from)
);

create table if not exists public.cctv_playback_logs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.cctv_playback_requests(id),
  action text not null check (action in ('VIEWED','EXPORTED','SHARED','DELIVERED','DELETED','OTHER')),
  performed_by uuid not null references auth.users(id),
  recipient text,
  details text,
  evidence_path text,
  created_at timestamptz not null default now()
);

create index if not exists idx_cctv_cameras_location on public.cctv_cameras(location_id);
create index if not exists idx_cctv_inspections_date on public.cctv_inspections(inspection_date desc);
create index if not exists idx_cctv_inspections_camera on public.cctv_inspections(camera_id, inspection_date desc);
create index if not exists idx_cctv_maintenance_status on public.cctv_maintenance(status, reported_at desc);
create index if not exists idx_cctv_playback_status on public.cctv_playback_requests(approval_status, created_at desc);
create index if not exists idx_cctv_playback_logs_request on public.cctv_playback_logs(request_id, created_at desc);

create or replace function public.cctv_has_role(allowed_roles text[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.cctv_user_roles r
    where r.user_id = auth.uid() and r.active = true and r.role = any(allowed_roles)
  );
$$;

create or replace function public.cctv_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_cctv_roles_updated on public.cctv_user_roles;
create trigger trg_cctv_roles_updated before update on public.cctv_user_roles
for each row execute function public.cctv_set_updated_at();
drop trigger if exists trg_cctv_cameras_updated on public.cctv_cameras;
create trigger trg_cctv_cameras_updated before update on public.cctv_cameras
for each row execute function public.cctv_set_updated_at();
drop trigger if exists trg_cctv_maintenance_updated on public.cctv_maintenance;
create trigger trg_cctv_maintenance_updated before update on public.cctv_maintenance
for each row execute function public.cctv_set_updated_at();
drop trigger if exists trg_cctv_playback_updated on public.cctv_playback_requests;
create trigger trg_cctv_playback_updated before update on public.cctv_playback_requests
for each row execute function public.cctv_set_updated_at();

alter table public.cctv_user_roles enable row level security;
alter table public.cctv_locations enable row level security;
alter table public.cctv_cameras enable row level security;
alter table public.cctv_inspections enable row level security;
alter table public.cctv_maintenance enable row level security;
alter table public.cctv_playback_requests enable row level security;
alter table public.cctv_playback_logs enable row level security;

drop policy if exists "cctv roles read own or admin" on public.cctv_user_roles;
create policy "cctv roles read own or admin" on public.cctv_user_roles for select to authenticated
using (user_id = auth.uid() or public.cctv_has_role(array['ADMIN']));
drop policy if exists "cctv roles admin manage" on public.cctv_user_roles;
create policy "cctv roles admin manage" on public.cctv_user_roles for all to authenticated
using (public.cctv_has_role(array['ADMIN'])) with check (public.cctv_has_role(array['ADMIN']));

drop policy if exists "cctv locations read" on public.cctv_locations;
create policy "cctv locations read" on public.cctv_locations for select to authenticated
using (public.cctv_has_role(array['ADMIN','SECURITY_MANAGER','SECURITY_OFFICER','CCTV_OPERATOR']));
drop policy if exists "cctv locations admin manage" on public.cctv_locations;
create policy "cctv locations admin manage" on public.cctv_locations for all to authenticated
using (public.cctv_has_role(array['ADMIN'])) with check (public.cctv_has_role(array['ADMIN']));

drop policy if exists "cctv cameras read" on public.cctv_cameras;
create policy "cctv cameras read" on public.cctv_cameras for select to authenticated
using (public.cctv_has_role(array['ADMIN','SECURITY_MANAGER','SECURITY_OFFICER','CCTV_OPERATOR']));
drop policy if exists "cctv cameras write" on public.cctv_cameras;
create policy "cctv cameras write" on public.cctv_cameras for all to authenticated
using (public.cctv_has_role(array['ADMIN','SECURITY_MANAGER','SECURITY_OFFICER']))
with check (public.cctv_has_role(array['ADMIN','SECURITY_MANAGER','SECURITY_OFFICER']));

drop policy if exists "cctv inspections read" on public.cctv_inspections;
create policy "cctv inspections read" on public.cctv_inspections for select to authenticated
using (public.cctv_has_role(array['ADMIN','SECURITY_MANAGER','SECURITY_OFFICER','CCTV_OPERATOR']));
drop policy if exists "cctv inspections insert" on public.cctv_inspections;
create policy "cctv inspections insert" on public.cctv_inspections for insert to authenticated
with check (inspected_by = auth.uid() and public.cctv_has_role(array['ADMIN','SECURITY_MANAGER','SECURITY_OFFICER','CCTV_OPERATOR']));

drop policy if exists "cctv maintenance read" on public.cctv_maintenance;
create policy "cctv maintenance read" on public.cctv_maintenance for select to authenticated
using (public.cctv_has_role(array['ADMIN','SECURITY_MANAGER','SECURITY_OFFICER']));
drop policy if exists "cctv maintenance create" on public.cctv_maintenance;
create policy "cctv maintenance create" on public.cctv_maintenance for insert to authenticated
with check (reported_by = auth.uid() and public.cctv_has_role(array['ADMIN','SECURITY_MANAGER','SECURITY_OFFICER']));
drop policy if exists "cctv maintenance update" on public.cctv_maintenance;
create policy "cctv maintenance update" on public.cctv_maintenance for update to authenticated
using (public.cctv_has_role(array['ADMIN','SECURITY_MANAGER','SECURITY_OFFICER']))
with check (public.cctv_has_role(array['ADMIN','SECURITY_MANAGER','SECURITY_OFFICER']));

drop policy if exists "cctv playback request read" on public.cctv_playback_requests;
create policy "cctv playback request read" on public.cctv_playback_requests for select to authenticated
using (requester_id = auth.uid() or public.cctv_has_role(array['ADMIN','SECURITY_MANAGER','CCTV_OPERATOR']));
drop policy if exists "cctv playback request create" on public.cctv_playback_requests;
create policy "cctv playback request create" on public.cctv_playback_requests for insert to authenticated
with check (requester_id = auth.uid() and public.cctv_has_role(array['ADMIN','SECURITY_MANAGER','SECURITY_OFFICER','CCTV_OPERATOR']));
drop policy if exists "cctv playback request manager update" on public.cctv_playback_requests;
create policy "cctv playback request manager update" on public.cctv_playback_requests for update to authenticated
using (public.cctv_has_role(array['ADMIN','SECURITY_MANAGER','CCTV_OPERATOR']))
with check (public.cctv_has_role(array['ADMIN','SECURITY_MANAGER','CCTV_OPERATOR']));

drop policy if exists "cctv playback logs read" on public.cctv_playback_logs;
create policy "cctv playback logs read" on public.cctv_playback_logs for select to authenticated
using (public.cctv_has_role(array['ADMIN','SECURITY_MANAGER','CCTV_OPERATOR']));
drop policy if exists "cctv playback logs append" on public.cctv_playback_logs;
create policy "cctv playback logs append" on public.cctv_playback_logs for insert to authenticated
with check (performed_by = auth.uid() and public.cctv_has_role(array['ADMIN','SECURITY_MANAGER','CCTV_OPERATOR']));
-- No UPDATE or DELETE policy on playback logs: preserve audit history.

insert into storage.buckets(id, name, public)
values ('cctv-evidence','cctv-evidence',false)
on conflict (id) do nothing;

drop policy if exists "cctv evidence authenticated read" on storage.objects;
create policy "cctv evidence authenticated read" on storage.objects for select to authenticated
using (bucket_id = 'cctv-evidence' and public.cctv_has_role(array['ADMIN','SECURITY_MANAGER','SECURITY_OFFICER','CCTV_OPERATOR']));
drop policy if exists "cctv evidence authorized upload" on storage.objects;
create policy "cctv evidence authorized upload" on storage.objects for insert to authenticated
with check (bucket_id = 'cctv-evidence' and public.cctv_has_role(array['ADMIN','SECURITY_MANAGER','SECURITY_OFFICER','CCTV_OPERATOR']));
drop policy if exists "cctv evidence admin delete" on storage.objects;
create policy "cctv evidence admin delete" on storage.objects for delete to authenticated
using (bucket_id = 'cctv-evidence' and public.cctv_has_role(array['ADMIN']));

-- IMPORTANT: after creating users in Supabase Auth, an existing ADMIN must assign
-- their UUID and role in cctv_user_roles. Do not expose service_role keys in the browser.
