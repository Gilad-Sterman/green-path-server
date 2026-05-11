-- Junction table: links batches to the shipment that contains them.
-- weight_kg here must not exceed batch's remaining_weight_kg.
CREATE TABLE public.shipment_items (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  shipment_id uuid        NOT NULL REFERENCES public.shipments(id),
  batch_id    uuid        NOT NULL REFERENCES public.batches(id),
  weight_kg   numeric     NOT NULL CHECK (weight_kg > 0)
);

ALTER TABLE public.shipment_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX shipment_items_shipment_id_idx ON public.shipment_items (shipment_id);
CREATE INDEX shipment_items_batch_id_idx    ON public.shipment_items (batch_id);
