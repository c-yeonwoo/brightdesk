-- Replace hourly automation with four market-session refreshes.
-- Times are Korea Standard Time (KST, UTC+9):
-- - 08:45 pre-open briefing
-- - 10:00 post-open confirmation
-- - 15:00 pre-close risk check
-- - 17:00 post-close daily summary
--
-- pg_cron evaluates schedules in UTC unless the database timezone is changed,
-- so the cron expressions below are converted from KST to UTC.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
DECLARE j RECORD;
BEGIN
  FOR j IN
    SELECT jobname
    FROM cron.job
    WHERE jobname IN (
      'brightdesk-collect-hourly',
      'brightdesk-rebalance-hourly',
      'brightdesk-market-preopen',
      'brightdesk-market-postopen',
      'brightdesk-market-preclose',
      'brightdesk-market-postclose'
    )
  LOOP
    PERFORM cron.unschedule(j.jobname);
  END LOOP;
END $$;

-- 08:45 KST = 23:45 UTC, Monday-Friday.
SELECT cron.schedule(
  'brightdesk-market-preopen',
  '45 23 * * 0-4',
  $cron$ SELECT public._invoke_cron('/api/public/cron/hourly-rebalance'); $cron$
);

-- 10:00 KST = 01:00 UTC, Monday-Friday.
SELECT cron.schedule(
  'brightdesk-market-postopen',
  '0 1 * * 1-5',
  $cron$ SELECT public._invoke_cron('/api/public/cron/hourly-rebalance'); $cron$
);

-- 15:00 KST = 06:00 UTC, Monday-Friday.
SELECT cron.schedule(
  'brightdesk-market-preclose',
  '0 6 * * 1-5',
  $cron$ SELECT public._invoke_cron('/api/public/cron/hourly-rebalance'); $cron$
);

-- 17:00 KST = 08:00 UTC, Monday-Friday.
SELECT cron.schedule(
  'brightdesk-market-postclose',
  '0 8 * * 1-5',
  $cron$ SELECT public._invoke_cron('/api/public/cron/hourly-rebalance'); $cron$
);
