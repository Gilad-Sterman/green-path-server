-- Junction table: links source materials (raw intakes OR existing batches) to the
-- batch that consumed them. Supports two source types:
--   'intake' → source_id references raw_material_intakes(id)
--   'batch'  → source_id references batches(id)  (batch consolidation / merge)
-- weight_kg must not exceed the source's remaining eligible/available weight.
-- Loop prevention (DFS) is enforced in the application layer before insert.
CREATE TABLE public.batch_components (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  batch_id    uuid        NOT NULL REFERENCES public.batches(id),
  source_type text        NOT NULL CHECK (source_type IN ('intake', 'batch')),
  -- source_id points to raw_material_intakes.id when source_type = 'intake',
  -- or to batches.id when source_type = 'batch'. FK enforced at app layer
  -- because PostgreSQL does not support polymorphic FKs natively.
  source_id   uuid        NOT NULL,
  weight_kg   numeric     NOT NULL CHECK (weight_kg > 0),
  -- convenience denorm: prevent duplicate source in same batch
  CONSTRAINT batch_components_unique_source UNIQUE (batch_id, source_type, source_id)
);

ALTER TABLE public.batch_components ENABLE ROW LEVEL SECURITY;

CREATE INDEX batch_components_batch_id_idx   ON public.batch_components (batch_id);
CREATE INDEX batch_components_source_id_idx  ON public.batch_components (source_id);
CREATE INDEX batch_components_source_type_idx ON public.batch_components (source_type);
