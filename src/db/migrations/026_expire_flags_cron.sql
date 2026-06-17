-- ============================================================
-- Migration: 026_expire_flags_cron.sql
-- Purpose:   Schedule a pg_cron job to expire stale open flags
--            that have been open for more than 72 hours.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage to postgres role (required in Supabase)
GRANT USAGE ON SCHEMA cron TO postgres;

-- Remove existing job if it exists (idempotent re-runs)
SELECT cron.unschedule('expire-stale-flags')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'expire-stale-flags'
);

-- Schedule to run every hour
-- Marks any 'open' flag older than 72 hours as 'expired'
SELECT cron.schedule(
  'expire-stale-flags',
  '0 * * * *', -- every hour at :00
  $$
    UPDATE public.flags
    SET
      status     = 'expired',
      updated_at = now()
    WHERE status = 'open'
      AND created_at < now() - INTERVAL '72 hours';
  $$
);
