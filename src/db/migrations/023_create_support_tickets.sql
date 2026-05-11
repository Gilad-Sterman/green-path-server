CREATE TABLE public.support_tickets (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  factory_id          uuid        NOT NULL REFERENCES public.factories(id),
  user_id             uuid        NOT NULL REFERENCES public.users(id),
  subject             text        NOT NULL,
  message             text        NOT NULL,
  related_entity_type text,
  related_entity_id   uuid,
  status              text        NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'in_progress', 'resolved', 'closed'))
);

CREATE TRIGGER set_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE INDEX support_tickets_factory_id_idx ON public.support_tickets (factory_id);
CREATE INDEX support_tickets_user_id_idx    ON public.support_tickets (user_id);
CREATE INDEX support_tickets_status_idx     ON public.support_tickets (status);
