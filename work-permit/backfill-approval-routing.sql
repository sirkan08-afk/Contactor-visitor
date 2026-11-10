-- Work Permit approval routing backfill
-- Adds missing pending department rows for existing submitted permits.
-- Preserves permits and any approval rows that already exist.

INSERT INTO public.work_permit_department_approvals
  (permit_id, department, status)
SELECT
  p.id,
  route.department,
  'pending'
FROM public.work_permits AS p
CROSS JOIN LATERAL (
  SELECT 'SECURITY'::text AS department
  UNION
  SELECT upper(replace(trim(p.department), ' ', '_'))
  WHERE nullif(trim(p.department), '') IS NOT NULL
) AS route
WHERE p.status = 'submitted'
  AND route.department IN (
    'SECURITY',
    'ENGINEERING',
    'HOUSEKEEPING',
    'F&B',
    'FRONT_OFFICE',
    'SAFETY'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.work_permit_department_approvals AS a
    WHERE a.permit_id = p.id
      AND a.department = route.department
  );

-- Verify how many approvals now exist per permit.
SELECT
  p.permit_no,
  p.status,
  a.department,
  a.status AS approval_status
FROM public.work_permits AS p
LEFT JOIN public.work_permit_department_approvals AS a
  ON a.permit_id = p.id
ORDER BY p.created_at DESC, a.department;
