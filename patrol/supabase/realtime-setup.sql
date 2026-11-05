-- Apply this migration once in the Supabase SQL Editor for the existing Patrol project.
-- It lets every active Patrol account see the shared patrol log and report evidence,
-- while keeping insert permission limited to each user's own records.

drop policy if exists "read own or admin patrol logs" on public.patrol_logs;
drop policy if exists "active users read all patrol logs" on public.patrol_logs;
create policy "active users read all patrol logs"
on public.patrol_logs
for select
to authenticated
using (public.patrol_is_active());

drop policy if exists "patrol read own or admin evidence" on storage.objects;
drop policy if exists "patrol read team evidence" on storage.objects;
create policy "patrol read team evidence"
on storage.objects
for select
to authenticated
using (bucket_id = 'patrol-evidence' and public.patrol_is_active());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'patrol_logs'
     ) then
    alter publication supabase_realtime add table public.patrol_logs;
  end if;
end
$$;
