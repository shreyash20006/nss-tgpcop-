-- NSS Portal Migration for Echo TGPCOP Supabase Project
-- Run in Supabase SQL Editor

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Volunteer ID sequence (concurrency-safe)
CREATE SEQUENCE IF NOT EXISTS nss_volunteer_seq START 1 INCREMENT 1;

-- NSS Coordinator/Admin roles table
CREATE TABLE IF NOT EXISTS public.nss_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'coordinator')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);
ALTER TABLE public.nss_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read nss_roles" ON public.nss_roles FOR SELECT TO authenticated USING (auth.uid() IN (SELECT user_id FROM public.nss_roles));
CREATE POLICY "Super admin manages roles" ON public.nss_roles FOR ALL TO authenticated USING (auth.uid() IN (SELECT user_id FROM public.nss_roles WHERE role = 'super_admin'));

-- NSS Volunteer Applications
CREATE TABLE IF NOT EXISTS public.nss_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ref_code TEXT UNIQUE NOT NULL DEFAULT 'NSS-REF-' || UPPER(SUBSTRING(gen_random_uuid()::text, 1, 8)),
    volunteer_id TEXT UNIQUE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    -- Personal info
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
    -- Photo
    photo_url TEXT,
    photo_path TEXT,
    -- Status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'revoked')),
    rejection_reason TEXT,
    -- QR
    qr_token_hash TEXT UNIQUE,
    -- Timestamps
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id),
    -- Consent
    consent BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT unique_roll_number UNIQUE (roll_number)
);
ALTER TABLE public.nss_applications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for nss_applications
CREATE POLICY "Applicant can view own application" ON public.nss_applications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Applicant can insert own application" ON public.nss_applications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND status = 'pending' AND volunteer_id IS NULL AND qr_token_hash IS NULL);
CREATE POLICY "Coordinator can view all applications" ON public.nss_applications FOR SELECT TO authenticated USING (auth.uid() IN (SELECT user_id FROM public.nss_roles));
CREATE POLICY "Public verify endpoint sees approved only" ON public.nss_applications FOR SELECT USING (status = 'approved' AND qr_token_hash IS NOT NULL);

-- NSS Audit Log
CREATE TABLE IF NOT EXISTS public.nss_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID REFERENCES public.nss_applications(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    performed_by UUID REFERENCES auth.users(id),
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.nss_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Coordinators can read audit log" ON public.nss_audit_log FOR SELECT TO authenticated USING (auth.uid() IN (SELECT user_id FROM public.nss_roles));
CREATE POLICY "System can insert audit log" ON public.nss_audit_log FOR INSERT TO authenticated WITH CHECK (true);

-- NSS Leadership Table
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
CREATE POLICY "Public can view published leadership" ON public.nss_leadership FOR SELECT USING (published = TRUE);
CREATE POLICY "Coordinators manage leadership" ON public.nss_leadership FOR ALL TO authenticated USING (auth.uid() IN (SELECT user_id FROM public.nss_roles));

-- Secure function: Approve volunteer (server-side, sets volunteer_id and qr_token_hash)
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
BEGIN
    -- Check caller is coordinator or super_admin
    IF NOT EXISTS (SELECT 1 FROM public.nss_roles WHERE user_id = auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT * INTO v_app FROM public.nss_applications WHERE id = app_id AND status = 'pending';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Application not found or not pending';
    END IF;

    -- Generate sequential volunteer ID
    v_seq := nextval('nss_volunteer_seq');
    v_year := TO_CHAR(NOW(), 'YY');
    v_volunteer_id := 'NSS-TGP-' || v_year || '-' || LPAD(v_seq::TEXT, 6, '0');

    -- Generate cryptographically secure token
    v_token := encode(gen_random_bytes(32), 'hex');
    v_token_hash := encode(digest(v_token, 'sha256'), 'hex');

    -- Update application
    UPDATE public.nss_applications
    SET status = 'approved',
        volunteer_id = v_volunteer_id,
        qr_token_hash = v_token_hash,
        reviewed_at = NOW(),
        reviewed_by = auth.uid()
    WHERE id = app_id;

    -- Audit log
    INSERT INTO public.nss_audit_log (application_id, action, performed_by, details)
    VALUES (app_id, 'approved', auth.uid(), 'Volunteer ID: ' || v_volunteer_id);

    RETURN jsonb_build_object('volunteer_id', v_volunteer_id, 'qr_token', v_token);
END;
$$;

-- Secure function: Reject volunteer
CREATE OR REPLACE FUNCTION public.nss_reject_volunteer(app_id UUID, reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.nss_roles WHERE user_id = auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    UPDATE public.nss_applications SET status = 'rejected', rejection_reason = reason, reviewed_at = NOW(), reviewed_by = auth.uid() WHERE id = app_id AND status = 'pending';
    INSERT INTO public.nss_audit_log (application_id, action, performed_by, details) VALUES (app_id, 'rejected', auth.uid(), reason);
END;
$$;

-- Secure function: Revoke card
CREATE OR REPLACE FUNCTION public.nss_revoke_card(app_id UUID, reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.nss_roles WHERE user_id = auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    UPDATE public.nss_applications SET status = 'revoked', reviewed_at = NOW(), reviewed_by = auth.uid() WHERE id = app_id AND status = 'approved';
    INSERT INTO public.nss_audit_log (application_id, action, performed_by, details) VALUES (app_id, 'revoked', auth.uid(), reason);
END;
$$;

-- Secure function: Public QR token verification (no auth required)
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
    v_hash := encode(digest(p_token, 'sha256'), 'hex');
    SELECT * INTO v_app FROM public.nss_applications WHERE qr_token_hash = v_hash;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('result', 'invalid', 'message', 'Unknown or invalid token');
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_nss_apps_status ON public.nss_applications (status);
CREATE INDEX IF NOT EXISTS idx_nss_apps_roll ON public.nss_applications (roll_number);
CREATE INDEX IF NOT EXISTS idx_nss_apps_user ON public.nss_applications (user_id);
CREATE INDEX IF NOT EXISTS idx_nss_apps_qr ON public.nss_applications (qr_token_hash);

-- Storage bucket instructions (run manually in Supabase dashboard):
-- Create bucket: nss_photos (public: false, max file size: 2MB, allowed types: image/jpeg,image/png,image/webp)
-- Create bucket: nss_leadership_photos (public: true)
