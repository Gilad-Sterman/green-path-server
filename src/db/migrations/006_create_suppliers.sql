CREATE TABLE public.suppliers (
  id                       uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  factory_id               uuid     NOT NULL REFERENCES public.factories(id),
  name                     text     NOT NULL,
  contact_person           text,
  phone                    text,
  email                    text,
  allowed_material_types   text[]   NOT NULL DEFAULT '{}',
  allowed_material_sources text[]   NOT NULL DEFAULT '{}',
  erp_id                   text,
  is_active                boolean  NOT NULL DEFAULT true,
  created_by               uuid     REFERENCES public.users(id)
);

CREATE TRIGGER set_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE INDEX suppliers_factory_id_idx ON public.suppliers (factory_id);
CREATE INDEX suppliers_is_active_idx  ON public.suppliers (is_active);
