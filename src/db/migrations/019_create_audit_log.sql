-- Append-only audit log. No updates or deletes — ever.
-- Every create/update/status-change in the system writes a record here.
CREATE TABLE public.audit_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  factory_id  uuid        REFERENCES public.factories(id),   -- NULL for internal_admin actions
  user_id     uuid        REFERENCES public.users(id),       -- NULL for system-generated events
  action      text        NOT NULL,   -- e.g. 'intake.created', 'shipment.status_changed'
  entity_type text        NOT NULL,
  entity_id   uuid,
  old_value   jsonb,
  new_value   jsonb,
  ip_address  inet,
  user_agent  text
);

-- No updated_at — this table is append-only, rows never change.
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX audit_log_factory_id_idx ON public.audit_log (factory_id);
CREATE INDEX audit_log_user_id_idx    ON public.audit_log (user_id);
CREATE INDEX audit_log_entity_idx     ON public.audit_log (entity_type, entity_id);
CREATE INDEX audit_log_created_at_idx ON public.audit_log (created_at);
