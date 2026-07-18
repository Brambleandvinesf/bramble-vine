
-- Tighten messages RLS: only authenticated users
DROP POLICY IF EXISTS "Anyone can delete messages" ON public.messages;
DROP POLICY IF EXISTS "Anyone can insert messages" ON public.messages;
DROP POLICY IF EXISTS "Anyone can read messages" ON public.messages;
DROP POLICY IF EXISTS "Anyone can update messages" ON public.messages;

REVOKE ALL ON public.messages FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;

CREATE POLICY "Authenticated can read messages" ON public.messages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert messages" ON public.messages
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update messages" ON public.messages
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete messages" ON public.messages
  FOR DELETE TO authenticated USING (true);

-- Allowlist enforcement: block signups from non-crew emails
CREATE OR REPLACE FUNCTION public.enforce_crew_allowlist()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed_emails text[] := ARRAY[
    'brandon@brambleandvine.com',
    'info@brambleandvinesf.com',
    'crew1@brambleandvine.com',
    'crew2@brambleandvine.com',
    'crew3@brambleandvine.com'
  ];
BEGIN
  IF lower(NEW.email) <> ALL(allowed_emails) THEN
    RAISE EXCEPTION 'This email is not on the Bramble & Vine crew allowlist.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_crew_allowlist_trigger ON auth.users;
CREATE TRIGGER enforce_crew_allowlist_trigger
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_crew_allowlist();
