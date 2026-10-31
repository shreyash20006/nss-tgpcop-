-- ==============================================================================
-- NSS (National Service Scheme) Portal - Full Supabase Database Migration
-- Project: eventtgpcop (gdwfptmtvzdfjcduhcvg)
-- https://gdwfptmtvzdfjcduhcvg.supabase.co
-- ==============================================================================
-- Instructions:
-- 1. Open your Supabase Dashboard: https://supabase.com/dashboard/project/gdwfptmtvzdfjcduhcvg
-- 2. Click "SQL Editor" on the left navigation bar
-- 3. Click "New query", paste this entire script, and click "Run" (Ctrl + Enter)
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. SEQUENTIAL VOLUNTEER ID GENERATOR (Concurrency-Safe)
CREATE SEQUENCE IF NOT EXISTS public.nss_volunteer_seq START 1 INCREMENT 1;

-- Helper functions (SECURITY DEFINER bypasses RLS recursion)
CREATE OR REPLACE FUNCTION public.nss_is_coordinator(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $
  SELECT EXISTS (
    SELECT 1 FROM public.nss_roles
    WHERE user_id = p_user_id
      AND role IN ('coordinator', 'super_admin')
  );
$;

CREATE OR REPLACE FUNCTION public.nss_is_super_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $
  SELECT EXISTS (
    SELECT 1 FROM public.nss_roles
    WHERE user_id = p_user_id
      AND role = 'super_admin'
  );
$;

-- ==============================================================================
-- 3. TABLE: nss_roles (Coordinator & Super Admin Authorization)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.nss_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'coordinator')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.nss_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read nss_roles" ON public.nss_roles;
DROP POLICY IF EXISTS "Super admin manages roles" ON public.nss_roles;
DROP POLICY IF EXISTS "Users can read own role" ON public.nss_roles;
DROP POLICY IF EXISTS "Super admins can manage roles" ON public.nss_roles;

-- Authenticated users can read their own role (Direct comparison = ZERO recursion)
CREATE POLICY "Users can read own role" ON public.nss_roles 
    FOR SELECT TO authenticated 
    USING (auth.uid() = user_id);

CREATE POLICY "Super admins can manage roles" ON public.nss_roles 
    FOR ALL TO authenticated 
    USING (public.nss_is_super_admin(auth.uid()))
    WITH CHECK (public.nss_is_super_admin(auth.uid()));

-- ==============================================================================
-- 4. TABLE: nss_applications (Volunteer Enrollment & Review)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.nss_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ref_code TEXT UNIQUE NOT NULL DEFAULT 'NSS-REF-' || UPPER(SUBSTRING(gen_random_uuid()::text, 1, 8)),
    volunteer_id TEXT UNIQUE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    -- Personal details
    full_name TEXT NOT NULL,
    roll_number TEXT NOT NULL,
    prn TEXT,
    course TEXT NOT NULL,
    academic_year TEXT NOT NULL CHECK (academic_year IN ('FY', 'SY', 'TY', 'Fourth Year')),
    division TEXT,
    college_email TEXT NOT NULL,
    personal_email TEXT,
    mobile TEXT NOT NULL,
    emergency_contact TEXT,
    -- Passport photo
    photo_url TEXT,
    photo_path TEXT,
    -- Status & review
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'revoked')),
    rejection_reason TEXT,
    -- Secure QR verification token hash
    qr_token_hash TEXT UNIQUE,
    -- Timestamps
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id),
    consent BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT unique_roll_number UNIQUE (roll_number)
);

ALTER TABLE public.nss_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Applicant can view own application" ON public.nss_applications;
CREATE POLICY "Applicant can view own application" ON public.nss_applications 
    FOR SELECT TO authenticated 
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Applicant can insert own application" ON public.nss_applications;
CREATE POLICY "Applicant can insert own application" ON public.nss_applications 
    FOR INSERT TO authenticated 
    WITH CHECK (auth.uid() = user_id AND status = 'pending' AND volunteer_id IS NULL AND qr_token_hash IS NULL);

DROP POLICY IF EXISTS "Coordinator can view all applications" ON public.nss_applications;
CREATE POLICY "Coordinator can view all applications" ON public.nss_applications 
    FOR SELECT TO authenticated 
    USING (public.nss_is_coordinator(auth.uid()));

DROP POLICY IF EXISTS "Coordinator can update applications" ON public.nss_applications;
CREATE POLICY "Coordinator can update applications" ON public.nss_applications 
    FOR UPDATE TO authenticated 
    USING (public.nss_is_coordinator(auth.uid()));

DROP POLICY IF EXISTS "Public verify endpoint sees approved only" ON public.nss_applications;
CREATE POLICY "Public verify endpoint sees approved only" ON public.nss_applications 
    FOR SELECT 
    USING (status = 'approved' AND qr_token_hash IS NOT NULL);

-- ==============================================================================
-- 5. TABLE: nss_audit_log (Coordinator Actions Audit Trail)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.nss_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID REFERENCES public.nss_applications(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    performed_by UUID REFERENCES auth.users(id),
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.nss_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coordinators can read audit log" ON public.nss_audit_log;
CREATE POLICY "Coordinators can read audit log" ON public.nss_audit_log 
    FOR SELECT TO authenticated 
    USING (public.nss_is_coordinator(auth.uid()));

DROP POLICY IF EXISTS "System can insert audit log" ON public.nss_audit_log;
CREATE POLICY "System can insert audit log" ON public.nss_audit_log 
    FOR INSERT TO authenticated 
    WITH CHECK (true);

-- ==============================================================================
-- 6. TABLE: nss_leadership (Leadership & Advisory Directory)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.nss_leadership (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    designation TEXT NOT NULL,
    department TEXT,
    bio TEXT,
    photo_url TEXT,
    photo_path TEXT,
    display_order INT DEFAULT 0,
    published BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.nss_leadership ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view published leadership" ON public.nss_leadership;
CREATE POLICY "Public can view published leadership" ON public.nss_leadership 
    FOR SELECT 
    USING (published = TRUE);

DROP POLICY IF EXISTS "Coordinators manage leadership" ON public.nss_leadership;
CREATE POLICY "Coordinators manage leadership" ON public.nss_leadership 
    FOR ALL TO authenticated 
    USING (public.nss_is_coordinator(auth.uid()));

-- ==============================================================================
-- 7. SECURE RPC FUNCTIONS (SECURITY DEFINER)
-- ==============================================================================

-- Function 1: Approve volunteer (concurrency-safe ID + cryptographically random QR token)
CREATE OR REPLACE FUNCTION public.nss_approve_volunteer(app_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_seq BIGINT;
    v_volunteer_id TEXT;
    v_token TEXT;
    v_token_hash TEXT;
    v_year TEXT;
    v_app public.nss_applications;
    v_is_coordinator BOOLEAN;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT * INTO v_app FROM public.nss_applications WHERE id = app_id AND status = 'pending';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Application not found or is not in pending status';
    END IF;

    -- Coordinators may approve any application; applicants may approve only their own.
    SELECT EXISTS (SELECT 1 FROM public.nss_roles WHERE user_id = auth.uid()) INTO v_is_coordinator;
    IF NOT v_is_coordinator AND v_app.user_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: applicants can only approve their own application';
    END IF;

    -- Concurrency-safe sequential Volunteer ID format: NSS-TGP-26-000001
    v_seq := nextval('public.nss_volunteer_seq');
    v_year := TO_CHAR(NOW(), 'YY');
    v_volunteer_id := 'NSS-TGP-' || v_year || '-' || LPAD(v_seq::TEXT, 6, '0');

    -- Cryptographically secure token (32 bytes hex = 64 characters)
    v_token := encode(gen_random_bytes(32), 'hex');
    v_token_hash := encode(digest(v_token, 'sha256'), 'hex');

    -- Update application
    UPDATE public.nss_applications
    SET status = 'approved',
        volunteer_id = v_volunteer_id,
        qr_token_hash = v_token_hash,
        reviewed_at = NOW(),
        reviewed_by = CASE WHEN v_is_coordinator THEN auth.uid() ELSE NULL END
    WHERE id = app_id;

    -- Record audit log
    INSERT INTO public.nss_audit_log (application_id, action, performed_by, details)
    VALUES (
        app_id,
        'approved',
        auth.uid(),
        CASE WHEN v_is_coordinator THEN 'Coordinator approved. ' ELSE 'Self-service auto-approval. ' END || 'Assigned Volunteer ID: ' || v_volunteer_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'volunteer_id', v_volunteer_id, 
        'qr_token', v_token
    );
END;
$$;

-- Function 2: Reject volunteer
CREATE OR REPLACE FUNCTION public.nss_reject_volunteer(app_id UUID, reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.nss_roles WHERE user_id = auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized: only NSS coordinators can reject volunteers';
    END IF;

    UPDATE public.nss_applications 
    SET status = 'rejected', 
        rejection_reason = reason, 
        reviewed_at = NOW(), 
        reviewed_by = auth.uid() 
    WHERE id = app_id AND status = 'pending';

    INSERT INTO public.nss_audit_log (application_id, action, performed_by, details) 
    VALUES (app_id, 'rejected', auth.uid(), COALESCE(reason, 'No reason provided'));

    RETURN jsonb_build_object('success', true);
END;
$$;

-- Function 3: Revoke card
CREATE OR REPLACE FUNCTION public.nss_revoke_card(app_id UUID, reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.nss_roles WHERE user_id = auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized: only NSS coordinators can revoke cards';
    END IF;

    UPDATE public.nss_applications 
    SET status = 'revoked', 
        reviewed_at = NOW(), 
        reviewed_by = auth.uid() 
    WHERE id = app_id AND status = 'approved';

    INSERT INTO public.nss_audit_log (application_id, action, performed_by, details) 
    VALUES (app_id, 'revoked', auth.uid(), COALESCE(reason, 'Card revoked by coordinator'));

    RETURN jsonb_build_object('success', true);
END;
$$;

-- Function 4: Public QR token verification (no auth required)
CREATE OR REPLACE FUNCTION public.nss_verify_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_hash TEXT;
    v_app public.nss_applications;
BEGIN
    IF p_token IS NULL OR LENGTH(TRIM(p_token)) < 16 THEN
        RETURN jsonb_build_object('result', 'invalid', 'message', 'Malformed or invalid verification token');
    END IF;

    v_hash := encode(digest(p_token, 'sha256'), 'hex');
    SELECT * INTO v_app FROM public.nss_applications WHERE qr_token_hash = v_hash;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('result', 'invalid', 'message', 'Certificate token not found in NSS registry');
    END IF;

    RETURN jsonb_build_object(
        'result', v_app.status,
        'name', v_app.full_name,
        'volunteer_id', v_app.volunteer_id,
        'course', v_app.course,
        'academic_year', v_app.academic_year,
        'photo_url', CASE WHEN v_app.status = 'approved' THEN v_app.photo_url ELSE NULL END,
        'issued_at', v_app.reviewed_at
    );
END;
$$;

-- ==============================================================================
-- 8. INDEXES FOR PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_nss_apps_status ON public.nss_applications (status);
CREATE INDEX IF NOT EXISTS idx_nss_apps_roll ON public.nss_applications (roll_number);
CREATE INDEX IF NOT EXISTS idx_nss_apps_user ON public.nss_applications (user_id);
CREATE INDEX IF NOT EXISTS idx_nss_apps_qr ON public.nss_applications (qr_token_hash);
CREATE INDEX IF NOT EXISTS idx_nss_apps_vol_id ON public.nss_applications (volunteer_id);

-- ==============================================================================
-- 9. SUPABASE STORAGE BUCKETS & POLICIES
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('nss_photos', 'nss_photos', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('nss_leadership_photos', 'nss_leadership_photos', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET 
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Authenticated users can upload photo" ON storage.objects;
CREATE POLICY "Authenticated users can upload photo" ON storage.objects
    FOR INSERT TO authenticated 
    WITH CHECK (bucket_id IN ('nss_photos', 'nss_leadership_photos'));

DROP POLICY IF EXISTS "Public can view photos" ON storage.objects;
CREATE POLICY "Public can view photos" ON storage.objects
    FOR SELECT 
    USING (bucket_id IN ('nss_photos', 'nss_leadership_photos'));

-- ==============================================================================
-- 10. AUTO-GRANT SUPER ADMIN ROLE TO YOUR ACCOUNT
-- ==============================================================================
INSERT INTO public.nss_roles (user_id, role)
SELECT id, 'super_admin'
FROM auth.users
WHERE email = 'sb108750@gmail.com'
ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin';
