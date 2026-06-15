CREATE TABLE public.batches (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  factory_id        uuid        NOT NULL REFERENCES public.factories(id),
  -- product_id is locked at creation — cannot be changed after batch is created
  product_id        uuid        NOT NULL REFERENCES public.products(id),
  -- batch_code is auto-generated (PR-DDMMYYYY-XXX) but user may override before save.
  -- Locked after creation. Unique per factory.
  batch_code        text        NOT NULL,
  -- batch_date defaults to today but user may set it to a past date.
  -- Future dates are blocked. Stored separately from created_at for traceability.
  batch_date        date        NOT NULL DEFAULT CURRENT_DATE,
  -- audit fields for batch_code override tracking
  original_batch_code text      NOT NULL,
  was_code_edited   boolean     NOT NULL DEFAULT false,
  status            text        NOT NULL DEFAULT 'in_progress'
                    CHECK (status IN ('in_progress', 'completed', 'cancelled', 'failed')),
  is_active         boolean     NOT NULL DEFAULT true,
  output_weight_kg  numeric     NOT NULL CHECK (output_weight_kg > 0),
  used_weight_kg    numeric     NOT NULL DEFAULT 0 CHECK (used_weight_kg >= 0),
  waste_weight_kg   numeric     NOT NULL DEFAULT 0 CHECK (waste_weight_kg >= 0),
  -- remaining_weight_kg is always derived: output_weight_kg - used_weight_kg - waste_weight_kg
  remaining_weight_kg numeric   NOT NULL GENERATED ALWAYS AS
                    (output_weight_kg - used_weight_kg - waste_weight_kg) STORED,
  block_reason      text,
  created_by        uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  notes             text,
  CONSTRAINT batches_batch_code_factory_unique UNIQUE (factory_id, batch_code)
);

CREATE TRIGGER set_batches_updated_at
  BEFORE UPDATE ON public.batches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;

CREATE INDEX batches_factory_id_idx ON public.batches (factory_id);
CREATE INDEX batches_product_id_idx ON public.batches (product_id);
CREATE INDEX batches_status_idx     ON public.batches (status);
CREATE INDEX batches_is_active_idx  ON public.batches (is_active);
