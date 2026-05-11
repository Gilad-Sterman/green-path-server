-- Junction table: links raw_material_intakes to the batch that consumed them.
-- weight_kg here must not exceed the intake's remaining eligible_weight_kg.
CREATE TABLE public.batch_components (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  batch_id   uuid        NOT NULL REFERENCES public.batches(id),
  intake_id  uuid        NOT NULL REFERENCES public.raw_material_intakes(id),
  weight_kg  numeric     NOT NULL CHECK (weight_kg > 0)
);

ALTER TABLE public.batch_components ENABLE ROW LEVEL SECURITY;

CREATE INDEX batch_components_batch_id_idx  ON public.batch_components (batch_id);
CREATE INDEX batch_components_intake_id_idx ON public.batch_components (intake_id);
