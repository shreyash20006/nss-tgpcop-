-- NSS TGPCOP: persistent, admin-controlled site maintenance mode.
-- Run in the Supabase SQL Editor after nss-master-upgrade.sql has installed
-- public.nss_is_staff(uuid).

CREATE TABLE IF NOT EXISTS public.nss_site_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  maintenance_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  maintenance_message TEXT NOT NULL DEFAULT 'The NSS portal is temporarily under maintenance. Please check back soon.'
    CHECK (char_length(maintenance_message) <= 500),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.nss_site_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.nss_site_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.nss_site_settings FROM anon, authenticated;
GRANT SELECT (id, maintenance_enabled, maintenance_message) ON public.nss_site_settings TO anon, authenticated;
GRANT UPDATE (maintenance_enabled, maintenance_message, updated_at, updated_by) ON public.nss_site_settings TO authenticated;

DROP POLICY IF EXISTS "Public can read maintenance notice" ON public.nss_site_settings;
CREATE POLICY "Public can read maintenance notice"
  ON public.nss_site_settings
  FOR SELECT
  TO anon, authenticated
  USING (id = 1);

DROP POLICY IF EXISTS "Staff can update maintenance setting" ON public.nss_site_settings;
CREATE POLICY "Staff can update maintenance setting"
  ON public.nss_site_settings
  FOR UPDATE
  TO authenticated
  USING (public.nss_is_staff(auth.uid()))
  WITH CHECK (public.nss_is_staff(auth.uid()));
