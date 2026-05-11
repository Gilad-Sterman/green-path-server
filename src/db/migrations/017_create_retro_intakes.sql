-- Retroactive intake: manager uploads historical documents to generate retro credits.
-- No batch assignment required. documents linked via documents.related_entity_id.
CREATE TABLE public.retro_intakes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  factory_id      uuid        NOT NULL REFERENCES public.factories(id),
  submitted_by    uuid        NOT NULL REFERENCES public.users(id),
  period_start    date        NOT NULL,
  period_end      date        NOT NULL,
  status          text        NOT NULL DEFAULT 'processing'
                  CHECK (status IN ('processing', 'completed', 'rejected')),
  documents_count integer     NOT NULL DEFAULT 0,
  notes           text,
  CONSTRAINT retro_period_valid CHECK (period_end > period_start)
);

CREATE TRIGGER set_retro_intakes_updated_at
  BEFORE UPDATE ON public.retro_intakes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.retro_intakes ENABLE ROW LEVEL SECURITY;

CREATE INDEX retro_intakes_factory_id_idx ON public.retro_intakes (factory_id);
CREATE INDEX retro_intakes_status_idx     ON public.retro_intakes (status);
CREATE INDEX retro_intakes_period_idx     ON public.retro_intakes (period_start, period_end);
