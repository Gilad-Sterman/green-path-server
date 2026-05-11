CREATE TABLE public.users (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- internal_admin users are not tied to a factory; all others must have factory_id
  factory_id    uuid        REFERENCES public.factories(id),
  phone_number  text        NOT NULL UNIQUE,
  full_name     text        NOT NULL,
  role          text        NOT NULL
                CHECK (role IN ('employee', 'manager', 'internal_admin')),
  is_active     boolean     NOT NULL DEFAULT true,
  last_login_at timestamptz,
  CONSTRAINT users_factory_required
    CHECK (role = 'internal_admin' OR factory_id IS NOT NULL)
);

CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE INDEX users_factory_id_idx   ON public.users (factory_id);
CREATE INDEX users_phone_number_idx ON public.users (phone_number);
CREATE INDEX users_role_idx         ON public.users (role);
CREATE INDEX users_is_active_idx    ON public.users (is_active);
