-- Migration 024: Create retro certification records table

CREATE TABLE public.retro_certification_records (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  factory_id              uuid        NOT NULL REFERENCES public.factories(id),
  import_batch_id         uuid        NOT NULL REFERENCES public.retro_intakes(id) ON DELETE CASCADE,
  record_type             text        CHECK (record_type IN ('inbound', 'outbound')),
  date                    date,
  material_type           text        CHECK (material_type IN ('PE', 'PP', 'PET', 'Other', 'PP/PE')),
  material_classification text        CHECK (material_classification IN ('recycled', 'virgin')),
  party_name              text,
  invoice_number          text,
  delivery_note_number    text,
  lab_test_reference      text,
  weight                  numeric     CHECK (weight != 0),
  eligible_percent        numeric     CHECK (eligible_percent BETWEEN 0 AND 100),
  calculated_credits      numeric     DEFAULT 0 CHECK (calculated_credits >= 0),
  retro                   boolean     NOT NULL DEFAULT true,
  status                  text        NOT NULL DEFAULT 'imported' CHECK (status IN ('imported', 'flagged', 'rejected')),
  errors                  jsonb,
  row_index               integer
);

CREATE TRIGGER set_retro_certification_records_updated_at
  BEFORE UPDATE ON public.retro_certification_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (Express server client will bypass this automatically)
ALTER TABLE public.retro_certification_records ENABLE ROW LEVEL SECURITY;

CREATE INDEX retro_cert_records_factory_id_idx ON public.retro_certification_records (factory_id);
CREATE INDEX retro_cert_records_import_batch_id_idx ON public.retro_certification_records (import_batch_id);
CREATE INDEX retro_cert_records_status_idx ON public.retro_certification_records (status);
