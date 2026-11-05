-- HOTEL SECURITY PATROL SYSTEM
-- Run in Supabase SQL Editor. Times are stored as timestamptz; UI displays Asia/Bangkok.
create extension if not exists pgcrypto;

create table if not exists public.patrol_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null,
 employee_code text unique,
 role text not null default 'guard' check (role in ('guard','admin')),
 active boolean not null default true,
 created_at timestamptz not null default now()
);

create table if not exists public.patrol_points (
 id uuid primary key default gen_random_uuid(),
 point_code text not null unique,
 area_code text not null,
 area_name text not null,
 point_name text not null,
 qr_token uuid not null unique default gen_random_uuid(),
 sort_order int not null default 0,
 active boolean not null default true,
 created_at timestamptz not null default now()
);

create table if not exists public.patrol_logs (
 id uuid primary key default gen_random_uuid(),
 point_id uuid not null references public.patrol_points(id),
 guard_id uuid not null references public.patrol_profiles(id),
 status text not null check (status in ('normal','abnormal','inaccessible')),
 notes text,
 evidence_path text,
 created_at timestamptz not null default now()
);
create index if not exists patrol_logs_created_at_idx on public.patrol_logs(created_at);
create index if not exists patrol_logs_point_id_idx on public.patrol_logs(point_id);
drop index if exists public.patrol_logs_cycle_idx;\nalter table public.patrol_logs drop column if exists patrol_cycle;
alter table public.patrol_logs add column if not exists round_time text check (round_time in ('10:00','14:00','18:00','22:00'));

-- Daily staffing plan: admin selects which patrol rounds are required on each date.
create table if not exists public.patrol_day_plans (
 patrol_date date primary key,
 plan_type text not null check (plan_type in ('full_day','morning_only','afternoon_only')),
 configured_by uuid not null references public.patrol_profiles(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.patrol_day_plans enable row level security;

alter table public.patrol_profiles enable row level security;
alter table public.patrol_points enable row level security;
alter table public.patrol_logs enable row level security;

-- SECURITY DEFINER helpers avoid recursive RLS when policies check the caller's profile.
create or replace function public.patrol_is_active()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.patrol_profiles p where p.id=auth.uid() and p.active); $$;
create or replace function public.patrol_is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.patrol_profiles p where p.id=auth.uid() and p.active and p.role='admin'); $$;

-- Profiles: users can read their own profile; admins can read all profiles.
create policy "profile self or admin read" on public.patrol_profiles for select to authenticated
using (id = auth.uid() or public.patrol_is_admin());

-- Active users can read point list. Only admins can manage points.
create policy "active users read points" on public.patrol_points for select to authenticated
using (public.patrol_is_active());
create policy "admins manage points" on public.patrol_points for all to authenticated
using (public.patrol_is_admin())
with check (exists(select 1 from public.patrol_profiles me where me.id=auth.uid() and me.role='admin' and me.active));

-- Guards can insert their own logs. Guards see own logs; admins see all logs.
create policy "insert own patrol log" on public.patrol_logs for insert to authenticated
with check (guard_id=auth.uid() and exists(select 1 from public.patrol_profiles me where me.id=auth.uid() and me.active));
create policy "read own or admin patrol logs" on public.patrol_logs for select to authenticated
using (guard_id=auth.uid() or public.patrol_is_admin());

create policy "active users read day plans" on public.patrol_day_plans for select to authenticated
using (public.patrol_is_active());
create policy "admins insert day plans" on public.patrol_day_plans for insert to authenticated
with check (public.patrol_is_admin() and configured_by=auth.uid());
create policy "admins update day plans" on public.patrol_day_plans for update to authenticated
using (public.patrol_is_admin()) with check (public.patrol_is_admin() and configured_by=auth.uid());

-- Private evidence bucket. Files are stored under {auth.uid()}/...
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('patrol-evidence','patrol-evidence',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
create policy "patrol upload own evidence" on storage.objects for insert to authenticated
with check (bucket_id='patrol-evidence' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "patrol read own or admin evidence" on storage.objects for select to authenticated
using (bucket_id='patrol-evidence' and ((storage.foldername(name))[1]=auth.uid()::text or exists(select 1 from public.patrol_profiles me where me.id=auth.uid() and me.role='admin' and me.active)));

-- Seed the 45 named patrol points. QR token values are generated by the database.
insert into public.patrol_points(point_code,area_code,area_name,point_name,sort_order) values
('A-01','A','อาคาร A','ชั้น 1',1),('A-02','A','อาคาร A','ชั้น 2',2),('A-03','A','อาคาร A','สระน้ำส่วนกลาง',3),('A-04','A','อาคาร A','บันไดทางลงริมน้ำ',4),
('B-01','B','อาคาร B','หน้าห้องพัก',5),('B-02','B','อาคาร B','ล็อบบี้',6),('B-03','B','อาคาร B','ลานจอดรถบัคกี้',7),
('C-01','C','อาคาร C','ชั้น LG',8),('C-02','C','อาคาร C','ชั้น G',9),('C-03','C','อาคาร C','ชั้น 2',10),('C-04','C','อาคาร C','ชั้น 3',11),('C-05','C','อาคาร C','ชั้น 4',12),
('D-01','D','อาคาร D','ห้อง MBD',13),('D-02','D','อาคาร D','บันไดทางลงริมน้ำ',14),
('E-01','E','อาคาร E','สะพานริมน้ำ',15),('E-02','E','อาคาร E','ทางเดินริมน้ำหน้าห้อง',16),('E-03','E','อาคาร E','ลานกลางข้างห้อง',17),('E-04','E','อาคาร E','ห้องเก็บของ',18),
('F-01','F','อาคาร F','ห้องปั๊ม',19),('F-02','F','อาคาร F','ห้องอาหาร',20),('F-03','F','อาคาร F','ภายในครัว',21),('F-04','F','อาคาร F','ด้านหลังห้องอาหาร',22),('F-05','F','อาคาร F','แก๊สสเตชั่น',23),('F-06','F','อาคาร F','ฟิตเนส',24),('F-07','F','อาคาร F','ลานจอดรถ',25),('F-08','F','อาคาร F','จุดจัดกิจกรรม',26),
('C41-01','C41','Capsule 41–44','ทางเดินหน้าห้องพัก',27),('C41-02','C41','Capsule 41–44','ห้องปั๊ม 41',28),('C42-01','C42','Capsule 41–44','ห้องปั๊ม 42',29),('C43-01','C43','Capsule 41–44','ห้องปั๊ม 43',30),('C44-01','C44','Capsule 41–44','ห้องปั๊ม 44',31),
('C51-01','C51','Capsule 51–56','ทางเดินหน้าห้องพัก',32),('C51-02','C51','Capsule 51–56','ห้องปั๊ม 51',33),('C52-01','C52','Capsule 51–56','ห้องปั๊ม 52',34),('C53-01','C53','Capsule 51–56','ห้องปั๊ม 53',35),('C54-01','C54','Capsule 51–56','ห้องปั๊ม 54',36),('C55-01','C55','Capsule 51–56','ห้องปั๊ม 55',37),('C56-01','C56','Capsule 51–56','ห้องปั๊ม 56',38),
('BALI-01','BALI','Bali','ทางเดินหน้าห้องพัก',39),
('EXT-01','EXT','จุดตรวจภายนอก','ถนนหน้าทางเข้า',40),('EXT-02','EXT','จุดตรวจภายนอก','ถนนทางเข้า',41),('EXT-03','EXT','จุดตรวจภายนอก','แยกเข้าล็อบบี้',42),('EXT-04','EXT','จุดตรวจภายนอก','ทางไปอาคาร F',43),('T2-01','T2','อาคาร T2','ห้อง MBD อาคาร T2',44),('EXT-05','EXT','จุดตรวจภายนอก','ลานจอดรถด้านนอก',45)
on conflict(point_code) do nothing;

-- Create Supabase Auth users first, then insert matching profile rows:
-- insert into public.patrol_profiles(id,full_name,employee_code,role)
-- values('<auth-user-uuid>','Security Admin','ADMIN001','admin');
-- For guards use role='guard'. Promote only trusted supervisors to admin.
