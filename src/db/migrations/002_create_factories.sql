CREATE TABLE public.factories (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  name            text        NOT NULL,
  company_id_number text      NOT NULL UNIQUE,
  address         text        NOT NULL,
  geofence_center jsonb,                  -- { "lat": 32.08, "lng": 34.78 }
  geofence_radius_meters numeric,
  status          text        NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'suspended', 'inactive')),
  created_by      uuid        REFERENCES public.users(id)
);

CREATE TRIGGER set_factories_updated_at
  BEFORE UPDATE ON public.factories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: enabled — all access goes through the Express server via service role key,
-- which bypasses RLS automatically. No direct client access is possible.
ALTER TABLE public.factories ENABLE ROW LEVEL SECURITY;

CREATE INDEX factories_status_idx ON public.factories (status);
