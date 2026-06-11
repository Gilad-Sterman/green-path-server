CREATE TABLE public.products (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  factory_id          uuid        NOT NULL REFERENCES public.factories(id),
  name                text        NOT NULL,
  description         text,
  required_lab_tests  text[]      NOT NULL DEFAULT '{}',
  is_active           boolean     NOT NULL DEFAULT true,
  material_recipe     jsonb        NOT NULL DEFAULT '[]',
  eligible_percent    numeric(5,2) NOT NULL DEFAULT 0,
);

CREATE TRIGGER set_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE INDEX products_factory_id_idx ON public.products (factory_id);
CREATE INDEX products_is_active_idx  ON public.products (is_active);

