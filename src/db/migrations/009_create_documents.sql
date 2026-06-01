CREATE TABLE public.documents (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  factory_id          uuid        NOT NULL REFERENCES public.factories(id),
  uploader_id         uuid        NOT NULL REFERENCES public.users(id),
  document_type       text        NOT NULL
                      CHECK (document_type IN (
                        'delivery_note', 'invoice_in', 'invoice_out',
                        'lab_test', 'retro_invoice', 'weighing_document', 'other'
                      )),
  file_url            text        NOT NULL,
  file_name           text,
  related_entity_type text,                   -- 'raw_intake' | 'shipment' | 'retro_intake' etc.
  related_entity_id   uuid,
  status              text        NOT NULL DEFAULT 'pending_review'
                      CHECK (status IN ('pending_review', 'approved', 'rejected')),
  ocr_status          text        NOT NULL DEFAULT 'pending'
                      CHECK (ocr_status IN ('pending', 'queued', 'processing', 'completed', 'failed')),
  raw_ocr_payload     jsonb,
  capture_method      text,                   -- 'camera_live' | 'upload'
  location_status     text,                   -- 'in_factory' | 'out_of_factory' | 'unknown'
  uploaded_at         timestamptz NOT NULL DEFAULT now(),
  review_note         text
);

CREATE TRIGGER set_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE INDEX documents_factory_id_idx      ON public.documents (factory_id);
CREATE INDEX documents_uploader_id_idx     ON public.documents (uploader_id);
CREATE INDEX documents_status_idx          ON public.documents (status);
CREATE INDEX documents_ocr_status_idx      ON public.documents (ocr_status);
CREATE INDEX documents_related_entity_idx  ON public.documents (related_entity_type, related_entity_id);
