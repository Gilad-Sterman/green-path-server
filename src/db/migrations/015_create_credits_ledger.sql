-- Append-only ledger: credits are never updated or deleted.
-- Operational credits are auto-generated when a shipment is created.
-- Retroactive credits are generated from retro_intakes.
CREATE TABLE public.credits_ledger (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  factory_id         uuid        NOT NULL REFERENCES public.factories(id),
  source_type        text        NOT NULL
                     CHECK (source_type IN ('operational_shipment', 'retroactive')),
  source_id          uuid        NOT NULL,   -- FK to shipments.id or retro_intakes.id
  kind               text        NOT NULL
                     CHECK (kind IN ('operational', 'retroactive')),
  retro              boolean     NOT NULL DEFAULT false,
  eligible_output_kg numeric     NOT NULL CHECK (eligible_output_kg > 0)
);

ALTER TABLE public.credits_ledger ENABLE ROW LEVEL SECURITY;

CREATE INDEX credits_ledger_factory_id_idx  ON public.credits_ledger (factory_id);
CREATE INDEX credits_ledger_kind_idx        ON public.credits_ledger (kind);
CREATE INDEX credits_ledger_source_type_idx ON public.credits_ledger (source_type);
CREATE INDEX credits_ledger_created_at_idx  ON public.credits_ledger (created_at);
