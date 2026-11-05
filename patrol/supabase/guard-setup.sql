-- HOTEL SECURITY PATROL: update guard display names and allow active guards to choose the daily shift
-- Run this once in Supabase SQL Editor for the WORK_PERMIT project.

update public.patrol_profiles
set full_name = case employee_code
  when 'SEC001' then 'Jitsupong Sawangsai'
  when 'SEC002' then 'Wittanapon Thanwarawat'
  else full_name
end
where employee_code in ('SEC001', 'SEC002');

-- Daily shift is shared for the whole Patrol team for the selected date.
-- Active authenticated users (ADMIN and SEC001/SEC002/SEC003) may set or change it.
drop policy if exists "admins insert day plans" on public.patrol_day_plans;
create policy "active users insert day plans"
on public.patrol_day_plans for insert to authenticated
with check (public.patrol_is_active() and configured_by = auth.uid());

drop policy if exists "admins update day plans" on public.patrol_day_plans;
create policy "active users update day plans"
on public.patrol_day_plans for update to authenticated
using (public.patrol_is_active())
with check (public.patrol_is_active() and configured_by = auth.uid());
