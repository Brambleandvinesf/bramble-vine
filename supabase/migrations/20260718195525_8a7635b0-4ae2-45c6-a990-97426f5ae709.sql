DROP TRIGGER IF EXISTS enforce_crew_allowlist_trigger ON auth.users;
DROP FUNCTION IF EXISTS public.enforce_crew_allowlist();
DROP TABLE IF EXISTS public.messages;
DROP TYPE IF EXISTS public.message_source;
DROP TYPE IF EXISTS public.message_status;