CREATE TABLE public.refresh_tokens (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  user_id     uuid        NOT NULL REFERENCES public.users(id),
  token       text        NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked     boolean     NOT NULL DEFAULT false,
  remember_me boolean     NOT NULL DEFAULT false
);

ALTER TABLE public.refresh_tokens ENABLE ROW LEVEL SECURITY;

CREATE INDEX refresh_tokens_user_id_idx    ON public.refresh_tokens (user_id);
CREATE INDEX refresh_tokens_token_idx      ON public.refresh_tokens (token);
CREATE INDEX refresh_tokens_expires_at_idx ON public.refresh_tokens (expires_at);
