ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS external_id text;
CREATE UNIQUE INDEX IF NOT EXISTS messages_source_external_id_key ON public.messages (source, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_received_at_desc_idx ON public.messages (received_at DESC);