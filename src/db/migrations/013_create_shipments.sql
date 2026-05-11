CREATE TABLE public.shipments (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  factory_id          uuid        NOT NULL REFERENCES public.factories(id),
  customer_id         uuid        NOT NULL REFERENCES public.customers(id),
  status              text        NOT NULL DEFAULT 'created'
                      CHECK (status IN ('created', 'shipped', 'delivered', 'cancelled')),
  shipment_date       date        NOT NULL,
  destination_address text        NOT NULL,
  -- eligible_output_kg is calculated and stored at shipment creation time
  eligible_output_kg  numeric     NOT NULL DEFAULT 0 CHECK (eligible_output_kg >= 0),
  notes               text
);

CREATE TRIGGER set_shipments_updated_at
  BEFORE UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

CREATE INDEX shipments_factory_id_idx   ON public.shipments (factory_id);
CREATE INDEX shipments_customer_id_idx  ON public.shipments (customer_id);
CREATE INDEX shipments_shipment_date_idx ON public.shipments (shipment_date);
CREATE INDEX shipments_status_idx       ON public.shipments (status);
