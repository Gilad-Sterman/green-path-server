CREATE TABLE public.customers (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  factory_id     uuid        NOT NULL REFERENCES public.factories(id),
  name           text        NOT NULL,
  contact_person text,
  phone          text,
  email          text,
  is_active      boolean     NOT NULL DEFAULT true
);

CREATE TRIGGER set_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE INDEX customers_factory_id_idx ON public.customers (factory_id);
CREATE INDEX customers_is_active_idx  ON public.customers (is_active);
