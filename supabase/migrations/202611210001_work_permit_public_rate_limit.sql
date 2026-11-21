-- Work Permit public endpoint rate limiting.
-- Apply this migration to Supabase project nldoneixnuapuzpeeznl before deploying the Edge Function.
-- The table and RPC are not accessible to anon/authenticated clients.

create table if not exists public.work_permit_public_rate_limits (
  ip_hash text not null,
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (ip_hash, window_start)
);

alter table public.work_permit_public_rate_limits enable row level security;
revoke all on table public.work_permit_public_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.work_permit_public_rate_limits to service_role;

create or replace function public.consume_work_permit_public_limit(
  p_ip_hash text,
  p_window_start timestamptz,
  p_max_requests integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if p_ip_hash is null or length(p_ip_hash) <> 64
     or p_window_start is null
     or p_max_requests < 1 or p_max_requests > 100 then
    raise exception 'Invalid rate limit parameters';
  end if;

  insert into public.work_permit_public_rate_limits (ip_hash, window_start, request_count, updated_at)
  values (p_ip_hash, p_window_start, 1, now())
  on conflict (ip_hash, window_start)
  do update set
    request_count = public.work_permit_public_rate_limits.request_count + 1,
    updated_at = now()
  returning request_count into v_count;

  delete from public.work_permit_public_rate_limits
  where window_start < now() - interval '1 day';

  return v_count <= p_max_requests;
end;
$$;

revoke all on function public.consume_work_permit_public_limit(text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.consume_work_permit_public_limit(text, timestamptz, integer) to service_role;
