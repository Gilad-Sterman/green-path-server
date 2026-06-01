-- Junction table: links batches to the shipment that contains them.
-- weight_kg here must not exceed batch's remaining_weight_kg.
-- eligible_percent is snapshotted from the product at shipment creation time.
-- credit = weight_kg * (eligible_percent / 100)
CREATE TABLE public.shipment_items (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz  NOT NULL DEFAULT now(),
  shipment_id      uuid         NOT NULL REFERENCES public.shipments(id),
  batch_id         uuid         NOT NULL REFERENCES public.batches(id),
  product_id       uuid         NOT NULL REFERENCES public.products(id),
  weight_kg        numeric      NOT NULL CHECK (weight_kg > 0),
  eligible_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (eligible_percent >= 0 AND eligible_percent <= 100),
  credit           numeric(10,2) NOT NULL DEFAULT 0 CHECK (credit >= 0)
);

ALTER TABLE public.shipment_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX shipment_items_shipment_id_idx ON public.shipment_items (shipment_id);
CREATE INDEX shipment_items_batch_id_idx    ON public.shipment_items (batch_id);
