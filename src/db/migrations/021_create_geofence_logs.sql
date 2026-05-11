-- Geofence check results logged on every relevant user action.
-- location_status feeds into data_entry_profile / trust scoring on intakes.
CREATE TABLE public.geofence_logs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  factory_id      uuid        NOT NULL REFERENCES public.factories(id),
  user_id         uuid        REFERENCES public.users(id),
  action          text        NOT NULL,   -- the action that triggered the check, e.g. 'intake.create'
  lat             numeric     NOT NULL,
  lng             numeric     NOT NULL,
  location_status text        NOT NULL
                  CHECK (location_status IN ('in_factory', 'out_of_factory', 'unknown'))
);

ALTER TABLE public.geofence_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX geofence_logs_factory_id_idx ON public.geofence_logs (factory_id);
CREATE INDEX geofence_logs_user_id_idx    ON public.geofence_logs (user_id);
CREATE INDEX geofence_logs_created_at_idx ON public.geofence_logs (created_at);
