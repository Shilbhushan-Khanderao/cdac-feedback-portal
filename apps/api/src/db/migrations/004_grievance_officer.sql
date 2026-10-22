-- VAPT CMP-1: a named person responsible for grievance/data-principal requests (DPDP), managed
-- by admin. No login of their own for now (YAGNI: add a real role only if/when this person
-- needs to work inside the portal, not just be a contact point).
CREATE TABLE IF NOT EXISTS public.grievance_officers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email CITEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.grievance_officers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grievance_officers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_all ON public.grievance_officers;
CREATE POLICY owner_all ON public.grievance_officers FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

-- Same "reference data: world-readable to the app, admin-only writes" shape as
-- centres/courses/batches/questions, so any staff can see who to refer a grievance to.
DROP POLICY IF EXISTS grievance_officers_select ON public.grievance_officers;
CREATE POLICY grievance_officers_select ON public.grievance_officers FOR SELECT USING (true);
DROP POLICY IF EXISTS grievance_officers_ins ON public.grievance_officers;
CREATE POLICY grievance_officers_ins ON public.grievance_officers FOR INSERT WITH CHECK (is_admin());
DROP POLICY IF EXISTS grievance_officers_upd ON public.grievance_officers;
CREATE POLICY grievance_officers_upd ON public.grievance_officers FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS grievance_officers_del ON public.grievance_officers;
CREATE POLICY grievance_officers_del ON public.grievance_officers FOR DELETE USING (is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.grievance_officers TO feedback_app;
