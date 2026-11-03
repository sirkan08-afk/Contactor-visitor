-- Contractor Daily Registration V8
-- Run this script in Supabase SQL Editor. Uses private storage and authenticated access.
create extension if not exists pgcrypto;

create table if not exists public.contractor_entries (
  id uuid primary key default gen_random_uuid(),
  work_date date not null default (now() at time zone 'Asia/Bangkok')::date,
  time_in timestamptz not null default now(),
  time_out timestamptz,
  id_last4 char(4) not null check (id_last4 ~ '^[0-9]{4}$'),
  full_name text not null,
  company_name text not null default 'ไม่มี',
  car_plate text not null default 'ไม่มี',
  department text not null,
  work_location text not null,
  team_size integer not null default 1 check (team_size >= 1 and team_size <= 500),
  id_card_path text,
  car_image_path text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists contractor_entries_work_date_idx on public.contractor_entries(work_date);
create index if not exists contractor_entries_active_idx on public.contractor_entries(id_last4) where time_out is null;

alter table public.contractor_entries enable row level security;

drop policy if exists "Authenticated staff can read entries" on public.contractor_entries;
create policy "Authenticated staff can read entries" on public.contractor_entries
for select to authenticated using (true);

drop policy if exists "Authenticated staff can insert entries" on public.contractor_entries;
create policy "Authenticated staff can insert entries" on public.contractor_entries
for insert to authenticated with check (auth.uid() = created_by);

drop policy if exists "Authenticated staff can update entries" on public.contractor_entries;
create policy "Authenticated staff can update entries" on public.contractor_entries
for update to authenticated using (true) with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contractor-private', 'contractor-private', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Authenticated staff upload contractor images" on storage.objects;
create policy "Authenticated staff upload contractor images" on storage.objects
for insert to authenticated with check (bucket_id = 'contractor-private');

drop policy if exists "Authenticated staff read contractor images" on storage.objects;
create policy "Authenticated staff read contractor images" on storage.objects
for select to authenticated using (bucket_id = 'contractor-private');

drop policy if exists "Authenticated staff delete contractor images" on storage.objects;
create policy "Authenticated staff delete contractor images" on storage.objects
for delete to authenticated using (bucket_id = 'contractor-private');

-- Check-out uses last four digits, matching only one active entry.
-- If more than one active record shares those four digits, it refuses to guess.
create or replace function public.checkout_contractor(p_id_last4 text)
returns table(result text, entry_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
declare
  matches integer;
  target_id uuid;
begin
  if auth.uid() is null then raise exception 'กรุณาเข้าสู่ระบบก่อน'; end if;
  if p_id_last4 !~ '^[0-9]{4}$' then raise exception 'กรุณากรอกเลขบัตร 4 ตัวท้าย'; end if;

  perform pg_advisory_xact_lock(hashtext(p_id_last4));
  select count(*), min(id) into matches, target_id
  from public.contractor_entries
  where id_last4 = p_id_last4 and time_out is null;

  if matches = 0 then return query select 'not_found'::text, null::uuid; return; end if;
  if matches > 1 then return query select 'ambiguous'::text, null::uuid; return; end if;

  update public.contractor_entries set time_out = now() where id = target_id;
  return query select 'checked_out'::text, target_id;
end;
$$;

grant execute on function public.checkout_contractor(text) to authenticated;
