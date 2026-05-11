CREATE TABLE public.lab_tests (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  factory_id  uuid        NOT NULL REFERENCES public.factories(id),
  batch_id    uuid        NOT NULL REFERENCES public.batches(id),
  test_type   text        NOT NULL,   -- e.g. 'contamination', 'moisture', 'purity'
  result      text        NOT NULL,
  passed      boolean     NOT NULL,
  document_id uuid        REFERENCES public.documents(id)
);

CREATE TRIGGER set_lab_tests_updated_at
  BEFORE UPDATE ON public.lab_tests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.lab_tests ENABLE ROW LEVEL SECURITY;

CREATE INDEX lab_tests_factory_id_idx ON public.lab_tests (factory_id);
CREATE INDEX lab_tests_batch_id_idx   ON public.lab_tests (batch_id);
