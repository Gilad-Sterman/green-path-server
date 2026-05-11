-- Tracks every eligible weight movement for mass balance calculations.
-- movement_type:
--   input      = eligible weight added (intake created)
--   output     = eligible weight consumed (credit generated via shipment)
--   allocation = weight reserved when assigned to batch
--   release    = weight freed when batch cancelled
CREATE TABLE public.material_ledger_entries (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  factory_id              uuid        NOT NULL REFERENCES public.factories(id),
  entity_type             text        NOT NULL,   -- 'intake' | 'batch' | 'shipment' | 'credit'
  entity_id               uuid        NOT NULL,
  movement_type           text        NOT NULL
                          CHECK (movement_type IN ('input', 'output', 'allocation', 'release')),
  material_type           text        NOT NULL,
  eligible_weight_delta_kg numeric    NOT NULL    -- positive = in, negative = out
);

ALTER TABLE public.material_ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE INDEX mle_factory_id_idx    ON public.material_ledger_entries (factory_id);
CREATE INDEX mle_entity_idx        ON public.material_ledger_entries (entity_type, entity_id);
CREATE INDEX mle_movement_type_idx ON public.material_ledger_entries (movement_type);
CREATE INDEX mle_created_at_idx    ON public.material_ledger_entries (created_at);
