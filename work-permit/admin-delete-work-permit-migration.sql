-- Permanent Work Permit deletion (ADMIN only).
-- Run once in Supabase SQL Editor for project nldoneixnuapuzpeeznl.
-- Deletes child rows with a direct FK to work_permits before deleting the permit.
-- Any deeper dependent rows are removed by their configured ON DELETE CASCADE constraints.

create or replace function public.admin_delete_work_permit(p_permit_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_deleted integer;
  r record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select public.current_user_role() into v_role;
  if v_role is distinct from 'ADMIN' then
    raise exception 'Only ADMIN can permanently delete Work Permits';
  end if;

  if p_permit_id is null then
    raise exception 'Work Permit ID is required';
  end if;

  -- Remove all directly related rows discovered from actual foreign keys.
  for r in
    select
      child_ns.nspname as child_schema,
      child_table.relname as child_table,
      child_col.attname as child_column,
      parent_col.attname as parent_column
    from pg_constraint fk
    join pg_class child_table on child_table.oid = fk.conrelid
    join pg_namespace child_ns on child_ns.oid = child_table.relnamespace
    join pg_class parent_table on parent_table.oid = fk.confrelid
    join pg_attribute child_col
      on child_col.attrelid = fk.conrelid and child_col.attnum = fk.conkey[1]
    join pg_attribute parent_col
      on parent_col.attrelid = fk.confrelid and parent_col.attnum = fk.confkey[1]
    where fk.contype = 'f'
      and fk.confrelid = 'public.work_permits'::regclass
      and child_ns.nspname = 'public'
      and array_length(fk.conkey, 1) = 1
  loop
    execute format(
      'delete from %I.%I where %I = (select %I from public.work_permits where id = $1)',
      r.child_schema, r.child_table, r.child_column, r.parent_column
    ) using p_permit_id;
  end loop;

  delete from public.work_permits where id = p_permit_id;
  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    raise exception 'Work Permit not found';
  end if;

  return true;
end;
$$;

revoke all on function public.admin_delete_work_permit(uuid) from public, anon;
grant execute on function public.admin_delete_work_permit(uuid) to authenticated;

