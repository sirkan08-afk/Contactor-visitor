-- Work Permit change: Security-only approval + readable daily queue numbers.
-- Review and run once in Supabase SQL Editor for project nldoneixnuapuzpeeznl.

begin;

create table if not exists public.work_permit_daily_sequences (
  work_date date not null,
  type_code text not null,
  last_number integer not null default 0,
  primary key (work_date, type_code)
);

alter table public.work_permit_daily_sequences enable row level security;
revoke all on public.work_permit_daily_sequences from anon, authenticated;
grant all on public.work_permit_daily_sequences to service_role;

create or replace function public.next_work_permit_no(p_type_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date := (now() at time zone 'Asia/Bangkok')::date;
  v_code text := upper(regexp_replace(coalesce(p_type_code, 'GEN'), '[^A-Z0-9]', '', 'g'));
  v_number integer;
begin
  if v_code !~ '^[A-Z0-9]{2,5}$' then v_code := 'GEN'; end if;
  insert into public.work_permit_daily_sequences(work_date, type_code, last_number)
  values (v_date, v_code, 1)
  on conflict (work_date, type_code)
  do update set last_number = public.work_permit_daily_sequences.last_number + 1
  returning last_number into v_number;

  return 'WP-' || to_char(v_date, 'YYMMDD') || '-' || v_code || lpad(v_number::text, 2, '0');
end;
$$;

revoke all on function public.next_work_permit_no(text) from public, anon, authenticated;
grant execute on function public.next_work_permit_no(text) to service_role;

-- Existing requests: retain only SECURITY approval row.
delete from public.work_permit_department_approvals
where department <> 'SECURITY';

-- Recalculate existing overall status from the single remaining Security decision.
update public.work_permits p
set status = case a.status
  when 'approved' then 'approved'
  when 'rejected' then 'rejected'
  when 'revision_requested' then 'revision_requested'
  else 'submitted'
end,
updated_at = now()
from public.work_permit_department_approvals a
where a.permit_id = p.id
  and a.department = 'SECURITY';

commit;
