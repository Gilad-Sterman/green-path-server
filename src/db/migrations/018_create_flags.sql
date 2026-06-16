-- Anomaly flags created by the system when business rules are violated.
-- Examples: mass-balance-exceeded, duplicate-delivery-note, batch-overused, ocr-mismatch
CREATE TABLE public.flags (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  factory_id      uuid        NOT NULL REFERENCES public.factories(id),
  entity_type     text        NOT NULL,   -- 'intake' | 'batch' | 'shipment' | 'credit' | 'document'
  entity_id       uuid        NOT NULL,
  reason          text        NOT NULL,   -- e.g. 'mass-balance-exceeded', 'duplicate-delivery-note'
  severity        text        NOT NULL
                  CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status          text        NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'resolved', 'dismissed', 'expired')),
  resolution      text,                   -- 'approved_exception' | 'corrected' | 'dismissed'
  resolution_note text,
  resolved_by     uuid        REFERENCES public.users(id),
  resolved_at     timestamptz
);

CREATE TRIGGER set_flags_updated_at
  BEFORE UPDATE ON public.flags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.flags ENABLE ROW LEVEL SECURITY;

CREATE INDEX flags_factory_id_idx ON public.flags (factory_id);
CREATE INDEX flags_entity_idx     ON public.flags (entity_type, entity_id);
CREATE INDEX flags_status_idx     ON public.flags (status);
CREATE INDEX flags_severity_idx   ON public.flags (severity);
