-- NSS impact counters and admin-managed activity records.
-- Run this in the SQL editor for the NSS Supabase project (gdwfptmtvzdfjcduhcvg).

CREATE TABLE IF NOT EXISTS public.nss_impact_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 160),
  activity_date DATE NOT NULL,
  volunteer_count INTEGER NOT NULL CHECK (volunteer_count >= 0),
  hours_per_volunteer NUMERIC(6,2) NOT NULL CHECK (hours_per_volunteer >= 0),
  completed BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nss_impact_activities_date
  ON public.nss_impact_activities (activity_date DESC);

ALTER TABLE public.nss_impact_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "NSS staff manage impact activities" ON public.nss_impact_activities;
CREATE POLICY "NSS staff manage impact activities"
  ON public.nss_impact_activities
  FOR ALL TO authenticated
  USING (public.nss_is_staff(auth.uid()))
  WITH CHECK (public.nss_is_staff(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nss_impact_activities TO authenticated;
REVOKE ALL ON public.nss_impact_activities FROM anon;

CREATE OR REPLACE FUNCTION public.nss_public_impact_stats()
RETURNS TABLE (active_volunteers BIGINT, camps_and_drives BIGINT, service_hours NUMERIC)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    (SELECT count(*) FROM public.nss_applications WHERE status = 'approved'),
    (SELECT count(*) FROM public.nss_impact_activities WHERE completed),
    (SELECT COALESCE(sum(volunteer_count * hours_per_volunteer), 0)
       FROM public.nss_impact_activities WHERE completed);
$$;

REVOKE ALL ON FUNCTION public.nss_public_impact_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nss_public_impact_stats() TO anon, authenticated;

-- Keep live registration notifications behind the existing application RLS.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.nss_applications;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;
