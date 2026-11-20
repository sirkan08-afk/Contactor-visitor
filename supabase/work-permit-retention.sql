-- Work Permit: permanently delete records older than 7 full days.
-- Run ONCE in Supabase SQL Editor AFTER deploying cleanup-work-permits.
-- Schedule: daily at 00:30 Thailand time (17:30 UTC).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret(
  'https://nldoneixnuapuzpeeznl.supabase.co/functions/v1/cleanup-work-permits',
  'work_permit_cleanup_url'
);
select vault.create_secret(
  'REPLACE_WITH_THE_SAME_LONG_RANDOM_SECRET_SET_AS_EDGE_FUNCTION_CRON_SECRET',
  'work_permit_cleanup_secret'
);

select cron.unschedule(jobid) from cron.job
where jobname = 'work-permit-7-day-retention';

select cron.schedule(
  'work-permit-7-day-retention',
  '30 17 * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'work_permit_cleanup_url' limit 1),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'work_permit_cleanup_secret' limit 1)
      ),
      body := jsonb_build_object('trigger', 'daily-work-permit-retention')
    );
  $job$
);
