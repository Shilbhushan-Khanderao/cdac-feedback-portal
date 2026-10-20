-- VAPT CMP-4: a server-side consent record, replacing the unrecorded localStorage-only flag.
-- One row per accepted notice version. Self-row only, same "own row" RLS shape as
-- student_roster/submissions (email = my_email()) — nobody, staff included, gets a bulk-read
-- policy here; staff don't need one. Version is a literal 'v1' for now (YAGNI: no admin UI to
-- manage notice versions yet).
CREATE TABLE IF NOT EXISTS public.consent_records (
  email CITEXT NOT NULL,
  version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (email, version)
);

ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_all ON public.consent_records;
CREATE POLICY owner_all ON public.consent_records FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS consent_records_select ON public.consent_records;
CREATE POLICY consent_records_select ON public.consent_records FOR SELECT USING (email = my_email());
DROP POLICY IF EXISTS consent_records_ins ON public.consent_records;
CREATE POLICY consent_records_ins ON public.consent_records FOR INSERT WITH CHECK (email = my_email());
DROP POLICY IF EXISTS consent_records_upd ON public.consent_records;
CREATE POLICY consent_records_upd ON public.consent_records FOR UPDATE
  USING (email = my_email()) WITH CHECK (email = my_email());

-- INSERT + SELECT for POST /api/consent's upsert path; UPDATE only because ON CONFLICT DO
-- UPDATE needs it for a re-accept of the same version. No DELETE grant: nothing deletes these.
GRANT SELECT, INSERT, UPDATE ON public.consent_records TO feedback_app;
