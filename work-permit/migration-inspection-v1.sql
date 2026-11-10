-- Work Permit Inspection persistence v1 (additive; preserves existing checklist rows)
begin;

alter table public.work_permit_checklists
  add column if not exists result_status text,
  add column if not exists inspector_id uuid references auth.users(id),
  add column if not exists inspected_at timestamptz;

alter table public.work_permit_checklists
  drop constraint if exists work_permit_checklists_result_status_check;
alter table public.work_permit_checklists
  add constraint work_permit_checklists_result_status_check
  check (result_status is null or result_status in ('yes','no','na'));

create index if not exists work_permit_checklists_permit_item_idx
  on public.work_permit_checklists (permit_id, item_no);

create table if not exists public.work_permit_inspection_photos (
  id uuid primary key default gen_random_uuid(),
  permit_id uuid not null references public.work_permits(id) on delete cascade,
  storage_path text not null unique,
  caption text,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.work_permit_inspection_photos enable row level security;

drop policy if exists "Staff view inspection photos" on public.work_permit_inspection_photos;
create policy "Staff view inspection photos"
on public.work_permit_inspection_photos for select to authenticated
using (public.current_user_role() in ('ADMIN','SAFETY','SECURITY'));

drop policy if exists "Staff upload inspection photo records" on public.work_permit_inspection_photos;
create policy "Staff upload inspection photo records"
on public.work_permit_inspection_photos for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and public.current_user_role() in ('ADMIN','SAFETY','SECURITY')
);

drop policy if exists "Staff delete own inspection photo records" on public.work_permit_inspection_photos;
create policy "Staff delete own inspection photo records"
on public.work_permit_inspection_photos for delete to authenticated
using (
  uploaded_by = auth.uid()
  or public.current_user_role() = 'ADMIN'
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('work-permit-inspections','work-permit-inspections',false,10485760,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Staff read work permit inspection files" on storage.objects;
create policy "Staff read work permit inspection files"
on storage.objects for select to authenticated
using (
  bucket_id = 'work-permit-inspections'
  and public.current_user_role() in ('ADMIN','SAFETY','SECURITY')
);

drop policy if exists "Staff upload work permit inspection files" on storage.objects;
create policy "Staff upload work permit inspection files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'work-permit-inspections'
  and public.current_user_role() in ('ADMIN','SAFETY','SECURITY')
  and (storage.foldername(name))[1] is not null
);

drop policy if exists "Staff delete work permit inspection files" on storage.objects;
create policy "Staff delete work permit inspection files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'work-permit-inspections'
  and ((storage.foldername(name))[2] = auth.uid()::text or public.current_user_role() = 'ADMIN')
);

commit;
