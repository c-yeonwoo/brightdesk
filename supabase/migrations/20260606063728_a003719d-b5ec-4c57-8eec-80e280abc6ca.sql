-- Schedule cron jobs to call public cron endpoints with x-cron-secret header.
-- Requires CRON_SECRET (project secret) AND the same value stored in Vault.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Ensure CRON_SECRET exists in Vault. The user must update this value with the
-- same secret stored in project secrets (see notes below).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'CRON_SECRET') THEN
    PERFORM vault.create_secret(
      'PLACEHOLDER_UPDATE_ME',
      'CRON_SECRET',
      'Shared secret for /api/public/cron/* endpoints. Must match project secret CRON_SECRET.'
    );
  END IF;
END $$;

-- Helper that posts to a cron endpoint with the secret header.
CREATE OR REPLACE FUNCTION public._invoke_cron(endpoint text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_secret text;
  v_url text;
  v_req_id bigint;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1;
  IF v_secret IS NULL OR v_secret = 'PLACEHOLDER_UPDATE_ME' THEN
    RAISE NOTICE 'CRON_SECRET vault entry is missing or placeholder; skipping %', endpoint;
    RETURN NULL;
  END IF;

  v_url := 'https://project--a94a2f42-70dd-4c01-ad15-f92537da2f57.lovable.app' || endpoint;

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) INTO v_req_id;

  RETURN v_req_id;
END;
$$;

REVOKE ALL ON FUNCTION public._invoke_cron(text) FROM PUBLIC, anon, authenticated;

-- Unschedule existing jobs with same names (idempotent re-run).
DO $$
DECLARE j RECORD;
BEGIN
  FOR j IN SELECT jobname FROM cron.job WHERE jobname IN ('brightdesk-collect-hourly','brightdesk-rebalance-hourly')
  LOOP
    PERFORM cron.unschedule(j.jobname);
  END LOOP;
END $$;

-- Hourly collector at minute 5.
SELECT cron.schedule(
  'brightdesk-collect-hourly',
  '5 * * * *',
  $cron$ SELECT public._invoke_cron('/api/public/cron/collect'); $cron$
);

-- Hourly rebalance at minute 20.
SELECT cron.schedule(
  'brightdesk-rebalance-hourly',
  '20 * * * *',
  $cron$ SELECT public._invoke_cron('/api/public/cron/hourly-rebalance'); $cron$
);