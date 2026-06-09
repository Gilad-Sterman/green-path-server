CREATE TABLE public.internal_weighing_records (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  intake_id        uuid        NOT NULL REFERENCES public.raw_material_intakes(id) ON DELETE CASCADE,
  factory_id       uuid        NOT NULL REFERENCES public.factories(id),
  document_id      uuid        REFERENCES public.documents(id),
  measured_weight  numeric     NOT NULL CHECK (measured_weight > 0),
  weighing_date    date        NOT NULL CHECK (weighing_date <= CURRENT_DATE),
  source_type      text        NOT NULL DEFAULT 'manual'
                   CHECK (source_type IN ('ocr', 'manual', 'ocr_edited')),
  notes            text,
  created_by       uuid        REFERENCES public.users(id)
);

CREATE TRIGGER set_internal_weighing_records_updated_at
  BEFORE UPDATE ON public.internal_weighing_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.internal_weighing_records ENABLE ROW LEVEL SECURITY;

CREATE INDEX iwr_intake_id_idx    ON public.internal_weighing_records (intake_id);
CREATE INDEX iwr_factory_id_idx   ON public.internal_weighing_records (factory_id);
CREATE INDEX iwr_created_at_idx   ON public.internal_weighing_records (created_at DESC);
