-- Contractor Visitor V8: automatic 30-day retention
-- Run once in Supabase SQL Editor AFTER deploying the cleanup-contractor-data
-- Edge Function and setting its CRON_SECRET environment variable.
--
-- The function deletes rows older than 30 x 24 hours from created_at and
-- removes their files from the private contractor-private Storage bucket.
-- Schedule: every day at 00:15 Asia/Bangkok (17:15 UTC).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Index keeps the daily expiry scan efficient.
create index if not exists contractor_entries_created_at_retention_idx
  on public.contractor_entries (created_at);

-- Store the function endpoint and the SAME secret configured for the
-- Edge Function as CRON_SECRET. Replace the placeholder before running.
select vault.create_secret(
  'https://aclsqitjruccxkzjtxbl.supabase.co/functions/v1/cleanup-contractor-data',
  'contractor_cleanup_url'
);

select vault.create_secret(
  'REPLACE_WITH_THE_SAME_LONG_RANDOM_SECRET_SET_AS_EDGE_FUNCTION_CRON_SECRET',
  'contractor_cleanup_secret'
);

-- Remove an earlier schedule with the same name, if present.
select cron.unschedule(jobid)
from cron.job
where jobname = 'contractor-retention-cleanup';

-- Run daily at 17:15 UTC = 00:15 Thailand time.
select cron.schedule(
  'contractor-retention-cleanup',
  '15 17 * * *',
  $job$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'contractor_cleanup_url'
        limit 1
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'contractor_cleanup_secret'
          limit 1
        )
      ),
      body := jsonb_build_object('trigger', 'daily-retention')
    );
  $job$
);
