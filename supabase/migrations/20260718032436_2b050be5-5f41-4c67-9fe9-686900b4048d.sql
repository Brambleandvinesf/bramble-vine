
CREATE TYPE public.message_source AS ENUM ('gmail', 'quo');
CREATE TYPE public.message_status AS ENUM ('read', 'unread');

CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source public.message_source NOT NULL,
  sender_name TEXT NOT NULL,
  content TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status public.message_status NOT NULL DEFAULT 'unread',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX messages_received_at_idx ON public.messages (received_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO anon;
GRANT ALL ON public.messages TO service_role;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- The crew app uses a client-side email allowlist (no Supabase auth session),
-- so permissive policies are used. Tighten later if Supabase auth is adopted.
CREATE POLICY "Anyone can read messages"
  ON public.messages FOR SELECT USING (true);
CREATE POLICY "Anyone can insert messages"
  ON public.messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update messages"
  ON public.messages FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete messages"
  ON public.messages FOR DELETE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
