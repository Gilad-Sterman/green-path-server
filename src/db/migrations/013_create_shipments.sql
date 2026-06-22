CREATE TABLE public.shipments (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  factory_id          uuid        NOT NULL REFERENCES public.factories(id),
  customer_id         uuid        NOT NULL REFERENCES public.customers(id),
  status              text        NOT NULL DEFAULT 'created'
                      CHECK (status IN ('created', 'shipped', 'delivered', 'cancelled')),
  shipment_date         date        NOT NULL,
  destination_address   text        NOT NULL,
  delivery_note_number  text,
  lab_test_number       text,
  -- eligible_output_kg is calculated (Σ weight × eligible_percent) and stored at creation time
  eligible_output_kg    numeric     NOT NULL DEFAULT 0 CHECK (eligible_output_kg >= 0),
  notes                 text,
  -- חשבשבת ERP invoice integration
  invoice_status        text        NOT NULL DEFAULT 'pending'
                        CHECK (invoice_status IN ('pending', 'received', 'failed')),
  invoice_number        text,
  invoice_date          date,
  invoice_file_url      text,
  hashavshevet_synced_at timestamptz,
  upload_invoice_manual  boolean     NOT NULL DEFAULT false
);

CREATE TRIGGER set_shipments_updated_at
  BEFORE UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

CREATE INDEX shipments_factory_id_idx   ON public.shipments (factory_id);
CREATE INDEX shipments_customer_id_idx  ON public.shipments (customer_id);
CREATE INDEX shipments_shipment_date_idx ON public.shipments (shipment_date);
CREATE INDEX shipments_status_idx       ON public.shipments (status);
