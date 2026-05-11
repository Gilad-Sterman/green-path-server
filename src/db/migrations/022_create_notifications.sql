CREATE TABLE public.notifications (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  factory_id        uuid        NOT NULL REFERENCES public.factories(id),
  user_id           uuid        REFERENCES public.users(id),   -- NULL = broadcast to all factory users
  message           text        NOT NULL,
  read              boolean     NOT NULL DEFAULT false,
  notification_type text                                        -- 'alert' | 'info' | 'warning'
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE INDEX notifications_factory_id_idx ON public.notifications (factory_id);
CREATE INDEX notifications_user_id_idx    ON public.notifications (user_id);
CREATE INDEX notifications_read_idx       ON public.notifications (read);
