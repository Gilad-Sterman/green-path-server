CREATE TABLE public.raw_material_intakes (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  factory_id             uuid        NOT NULL REFERENCES public.factories(id),
  supplier_id            uuid        NOT NULL REFERENCES public.suppliers(id),
  material_type          text        NOT NULL,
  is_recycled            boolean     NOT NULL DEFAULT false,  
  net_weight_kg          numeric     NOT NULL CHECK (net_weight_kg > 0),
  eligible_input_percent numeric     NOT NULL DEFAULT 100
                         CHECK (eligible_input_percent >= 0 AND eligible_input_percent <= 100),
  -- eligible_weight_kg is always derived: net_weight_kg * eligible_input_percent / 100
  eligible_weight_kg     numeric     NOT NULL GENERATED ALWAYS AS
                         (net_weight_kg * eligible_input_percent / 100) STORED,
  intake_date            date        NOT NULL
                         CHECK (intake_date <= CURRENT_DATE),
  delivery_note_number   text        NOT NULL,
  data_entry_profile     text,                   -- 'trusted_capture' | 'mixed_capture' | 'manual_capture'
  location_status        text,                   -- 'in_factory' | 'out_of_factory' | 'unknown'
  notes                  text,
  created_by             uuid        REFERENCES public.users(id),
  -- Internal weighing: factory re-weighs material after arrival
  has_internal_weighing  boolean     NOT NULL DEFAULT false,
  internal_weight_kg     numeric     CHECK (internal_weight_kg > 0),
  -- Duplicate delivery notes blocked per supplier per factory
  UNIQUE (factory_id, supplier_id, delivery_note_number)
);

CREATE TRIGGER set_raw_material_intakes_updated_at
  BEFORE UPDATE ON public.raw_material_intakes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.raw_material_intakes ENABLE ROW LEVEL SECURITY;

CREATE INDEX rmi_factory_id_idx   ON public.raw_material_intakes (factory_id);
CREATE INDEX rmi_supplier_id_idx  ON public.raw_material_intakes (supplier_id);
CREATE INDEX rmi_intake_date_idx  ON public.raw_material_intakes (intake_date);
CREATE INDEX rmi_material_type_idx ON public.raw_material_intakes (material_type);
