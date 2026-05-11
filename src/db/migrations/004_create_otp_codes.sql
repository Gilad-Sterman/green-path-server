CREATE TABLE public.otp_codes (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  phone_number text        NOT NULL,
  code         text        NOT NULL,
  expires_at   timestamptz NOT NULL,
  used         boolean     NOT NULL DEFAULT false,
  attempts     integer     NOT NULL DEFAULT 0
);

ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

CREATE INDEX otp_codes_phone_number_idx ON public.otp_codes (phone_number);
CREATE INDEX otp_codes_expires_at_idx   ON public.otp_codes (expires_at);
