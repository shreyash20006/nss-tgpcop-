-- ==============================================================================
-- NSS TGPCOP - Complete Authentication, RBAC, Student Registry & Security Upgrade
-- Target: Supabase Project (https://gdwfptmtvzdfjcduhcvg.supabase.co)
-- NON-DESTRUCTIVE: Preserves all existing applications, directory records & audit logs.
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. RBAC ROLES UPGRADE (nss_roles & nss_role_invitations)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.nss_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'volunteer',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Upgrade role check constraint to include 'president', 'faculty', 'volunteer'
ALTER TABLE public.nss_roles DROP CONSTRAINT IF EXISTS nss_roles_role_check;
ALTER TABLE public.nss_roles ADD CONSTRAINT nss_roles_role_check 
  CHECK (role IN ('super_admin', 'coordinator', 'president', 'faculty', 'volunteer'));

-- Invitations table for secure role granting (e.g. President invitation)
CREATE TABLE IF NOT EXISTS public.nss_role_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    name TEXT NULL,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'coordinator', 'president', 'faculty')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'activated', 'revoked')),
    invited_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    activated_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_nss_invites_email ON public.nss_role_invitations(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_nss_invites_status ON public.nss_role_invitations(status);

-- Pre-seed Official President Invitation for Shivam Waghmare (shivamw2005@gmail.com)
INSERT INTO public.nss_role_invitations (email, name, role, status, metadata)
VALUES (
  'shivamw2005@gmail.com',
  'Shivam Waghmare',
  'president',
  'pending',
  '{"designation": "NSS President", "phone": "", "department": "Pharmacy"}'::jsonb
)
ON CONFLICT DO NOTHING;

-- Also seed president invitation for nss-president@tgpcop.site
INSERT INTO public.nss_role_invitations (email, name, role, status, metadata)
VALUES (
  'nss-president@tgpcop.site',
  'NSS President Office',
  'president',
  'pending',
  '{"designation": "NSS President (Official)", "department": "Pharmacy"}'::jsonb
)
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- 3. SECURITY DEFINER HELPER FUNCTIONS
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.nss_user_role(p_user_id UUID DEFAULT auth.uid())
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM public.nss_roles WHERE user_id = p_user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.nss_is_super_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.nss_roles
    WHERE user_id = p_user_id AND role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.nss_is_coordinator(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.nss_roles
    WHERE user_id = p_user_id AND role IN ('coordinator', 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.nss_is_president(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.nss_roles
    WHERE user_id = p_user_id AND role = 'president'
  );
$$;

CREATE OR REPLACE FUNCTION public.nss_is_staff(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.nss_roles
    WHERE user_id = p_user_id AND role IN ('super_admin', 'coordinator', 'president', 'faculty')
  );
$$;

-- Secure function to activate role invitation upon login
CREATE OR REPLACE FUNCTION public.nss_check_and_activate_invitation(p_user_id UUID, p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.nss_role_invitations;
  v_role TEXT;
BEGIN
  IF p_user_id IS NULL OR p_email IS NULL THEN
    RETURN NULL;
  END IF;

  -- 1. Check if user already has an assigned role
  SELECT role INTO v_role FROM public.nss_roles WHERE user_id = p_user_id;
  IF v_role IS NOT NULL THEN
    RETURN v_role;
  END IF;

  -- 2. Check for matching pending invitation by email
  SELECT * INTO v_invite 
  FROM public.nss_role_invitations 
  WHERE LOWER(email) = LOWER(p_email) AND status = 'pending'
  ORDER BY created_at DESC LIMIT 1;

  IF FOUND THEN
    INSERT INTO public.nss_roles (user_id, role)
    VALUES (p_user_id, v_invite.role)
    ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

    UPDATE public.nss_role_invitations
    SET status = 'activated', activated_at = NOW()
    WHERE id = v_invite.id;

    INSERT INTO public.nss_audit_log (action, performed_by, details)
    VALUES ('role_activated_via_invite', p_user_id, 'Activated ' || v_invite.role || ' for ' || p_email);

    RETURN v_invite.role;
  END IF;

  RETURN 'volunteer';
END;
$$;

-- If shivamw2005@gmail.com is already registered in auth.users, grant president immediately
INSERT INTO public.nss_roles (user_id, role)
SELECT id, 'president'
FROM auth.users
WHERE LOWER(email) = 'shivamw2005@gmail.com'
ON CONFLICT (user_id) DO UPDATE SET role = 'president';

-- Ensure Super Admin is granted to coordinator primary email
INSERT INTO public.nss_roles (user_id, role)
SELECT id, 'super_admin'
FROM auth.users
WHERE LOWER(email) IN ('sb108750@gmail.com', 'viratkhi9089@gmail.com', 'shreyash20006@gmail.com')
ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin';

-- ==============================================================================
-- 4. CENTRALIZED STUDENT REGISTRY (nss_students)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.nss_students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    -- Identity
    full_name TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    google_email TEXT,
    college_email TEXT,
    google_avatar_url TEXT,
    -- Academic
    roll_number TEXT,
    prn TEXT,
    course TEXT DEFAULT 'B.Pharm',
    academic_year TEXT DEFAULT 'FY',
    division TEXT,
    department TEXT DEFAULT 'Pharmacy',
    -- Contact
    mobile TEXT,
    emergency_contact TEXT,
    -- Volunteer Status
    registration_id UUID REFERENCES public.nss_applications(id) ON DELETE SET NULL,
    application_status TEXT NOT NULL DEFAULT 'not_registered' 
      CHECK (application_status IN ('not_registered', 'pending', 'approved', 'rejected', 'revoked')),
    volunteer_id TEXT,
    approval_date TIMESTAMPTZ,
    approved_by UUID REFERENCES auth.users(id),
    -- System
    data_source TEXT NOT NULL DEFAULT 'web_registration', -- 'web_registration', 'excel_import', 'google_login'
    import_batch_id TEXT,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique index on roll_number when present
CREATE UNIQUE INDEX IF NOT EXISTS idx_nss_students_roll ON public.nss_students(roll_number) WHERE roll_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nss_students_user ON public.nss_students(user_id);
CREATE INDEX IF NOT EXISTS idx_nss_students_email ON public.nss_students(LOWER(google_email));
CREATE INDEX IF NOT EXISTS idx_nss_students_coll_email ON public.nss_students(LOWER(college_email));
CREATE INDEX IF NOT EXISTS idx_nss_students_status ON public.nss_students(application_status);
CREATE INDEX IF NOT EXISTS idx_nss_students_prn ON public.nss_students(prn);

-- Sync existing approved/pending applications into nss_students
INSERT INTO public.nss_students (
  user_id, full_name, college_email, roll_number, prn, course, academic_year,
  division, mobile, registration_id, application_status, volunteer_id, created_at, updated_at
)
SELECT 
  a.user_id, a.full_name, a.college_email, a.roll_number, a.prn, a.course, a.academic_year,
  a.division, a.mobile, a.id, a.status, a.volunteer_id, a.submitted_at, NOW()
FROM public.nss_applications a
WHERE a.roll_number IS NOT NULL
ON CONFLICT (roll_number) DO UPDATE SET 
  user_id = COALESCE(EXCLUDED.user_id, nss_students.user_id),
  application_status = EXCLUDED.application_status,
  volunteer_id = EXCLUDED.volunteer_id,
  registration_id = EXCLUDED.registration_id,
  updated_at = NOW();

-- ==============================================================================
-- 5. LOGIN TRACKING TABLE (nss_login_activity)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.nss_login_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'volunteer',
    is_registered BOOLEAN NOT NULL DEFAULT FALSE,
    roll_number TEXT,
    course TEXT,
    academic_year TEXT,
    ip_address TEXT,
    user_agent TEXT,
    login_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nss_login_user ON public.nss_login_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_nss_login_email ON public.nss_login_activity(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_nss_login_at ON public.nss_login_activity(login_at DESC);

-- RPC to record login safely and update student's last_login_at
CREATE OR REPLACE FUNCTION public.nss_record_login(
  p_user_agent TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_name TEXT;
  v_avatar TEXT;
  v_role TEXT := 'volunteer';
  v_student public.nss_students;
  v_is_reg BOOLEAN := FALSE;
  v_roll TEXT := NULL;
  v_course TEXT := NULL;
  v_year TEXT := NULL;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated');
  END IF;

  SELECT email, raw_user_meta_data->>'full_name', raw_user_meta_data->>'avatar_url'
  INTO v_email, v_name, v_avatar
  FROM auth.users
  WHERE id = v_uid;

  -- Activate any pending invitations for this email
  v_role := public.nss_check_and_activate_invitation(v_uid, v_email);
  IF v_role IS NULL THEN
    v_role := 'volunteer';
  END IF;

  -- Check if user is registered student
  SELECT * INTO v_student FROM public.nss_students WHERE user_id = v_uid LIMIT 1;
  IF FOUND THEN
    v_is_reg := (v_student.application_status IN ('approved', 'pending'));
    v_roll := v_student.roll_number;
    v_course := v_student.course;
    v_year := v_student.academic_year;

    UPDATE public.nss_students 
    SET last_login_at = NOW(),
        google_email = COALESCE(google_email, v_email),
        google_avatar_url = COALESCE(google_avatar_url, v_avatar)
    WHERE id = v_student.id;
  ELSE
    -- Try match by college_email or google_email
    SELECT * INTO v_student FROM public.nss_students 
    WHERE LOWER(college_email) = LOWER(v_email) OR LOWER(google_email) = LOWER(v_email)
    LIMIT 1;

    IF FOUND THEN
      v_is_reg := (v_student.application_status IN ('approved', 'pending'));
      v_roll := v_student.roll_number;
      v_course := v_student.course;
      v_year := v_student.academic_year;

      UPDATE public.nss_students 
      SET user_id = v_uid,
          last_login_at = NOW(),
          google_email = v_email,
          google_avatar_url = COALESCE(google_avatar_url, v_avatar)
      WHERE id = v_student.id;
    END IF;
  END IF;

  -- Insert login activity
  INSERT INTO public.nss_login_activity (
    user_id, email, full_name, avatar_url, role, is_registered,
    roll_number, course, academic_year, ip_address, user_agent, login_at
  )
  VALUES (
    v_uid, v_email, v_name, v_avatar, v_role, v_is_reg,
    v_roll, v_course, v_year, p_ip_address, p_user_agent, NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'role', v_role,
    'is_registered', v_is_reg,
    'email', v_email,
    'name', v_name
  );
END;
$$;

-- ==============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.nss_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nss_role_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nss_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nss_login_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nss_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nss_volunteer_directory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nss_email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nss_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nss_leadership ENABLE ROW LEVEL SECURITY;

-- Policy: nss_roles
DROP POLICY IF EXISTS "Users can read own role" ON public.nss_roles;
CREATE POLICY "Users can read own role" ON public.nss_roles 
    FOR SELECT TO authenticated 
    USING (auth.uid() = user_id OR public.nss_is_staff(auth.uid()));

DROP POLICY IF EXISTS "Super admins manage roles" ON public.nss_roles;
CREATE POLICY "Super admins manage roles" ON public.nss_roles 
    FOR ALL TO authenticated 
    USING (public.nss_is_super_admin(auth.uid()))
    WITH CHECK (public.nss_is_super_admin(auth.uid()));

-- Policy: nss_role_invitations
DROP POLICY IF EXISTS "Staff can read invitations" ON public.nss_role_invitations;
CREATE POLICY "Staff can read invitations" ON public.nss_role_invitations 
    FOR SELECT TO authenticated 
    USING (public.nss_is_staff(auth.uid()) OR LOWER(email) = LOWER(auth.jwt()->>'email'));

DROP POLICY IF EXISTS "Super admins manage invitations" ON public.nss_role_invitations;
CREATE POLICY "Super admins manage invitations" ON public.nss_role_invitations 
    FOR ALL TO authenticated 
    USING (public.nss_is_super_admin(auth.uid()))
    WITH CHECK (public.nss_is_super_admin(auth.uid()));

-- Policy: nss_students
DROP POLICY IF EXISTS "Students can view own profile" ON public.nss_students;
CREATE POLICY "Students can view own profile" ON public.nss_students 
    FOR SELECT TO authenticated 
    USING (auth.uid() = user_id OR public.nss_is_staff(auth.uid()));

DROP POLICY IF EXISTS "Students can update own contact details" ON public.nss_students;
CREATE POLICY "Students can update own contact details" ON public.nss_students 
    FOR UPDATE TO authenticated 
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Staff can manage student records" ON public.nss_students;
CREATE POLICY "Staff can manage student records" ON public.nss_students 
    FOR ALL TO authenticated 
    USING (public.nss_is_coordinator(auth.uid()))
    WITH CHECK (public.nss_is_coordinator(auth.uid()));

-- Policy: nss_login_activity
DROP POLICY IF EXISTS "Staff can view login activity" ON public.nss_login_activity;
CREATE POLICY "Staff can view login activity" ON public.nss_login_activity 
    FOR SELECT TO authenticated 
    USING (public.nss_is_staff(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users insert own login" ON public.nss_login_activity;
CREATE POLICY "Authenticated users insert own login" ON public.nss_login_activity 
    FOR INSERT TO authenticated 
    WITH CHECK (auth.uid() = user_id);

-- Policy: nss_applications
DROP POLICY IF EXISTS "Applicant can view own application" ON public.nss_applications;
CREATE POLICY "Applicant can view own application" ON public.nss_applications 
    FOR SELECT TO authenticated 
    USING (auth.uid() = user_id OR public.nss_is_staff(auth.uid()));

DROP POLICY IF EXISTS "Applicant can insert own application" ON public.nss_applications;
CREATE POLICY "Applicant can insert own application" ON public.nss_applications 
    FOR INSERT TO authenticated 
    WITH CHECK (auth.uid() = user_id AND status = 'pending' AND volunteer_id IS NULL AND qr_token_hash IS NULL);

DROP POLICY IF EXISTS "Coordinators can update applications" ON public.nss_applications;
CREATE POLICY "Coordinators can update applications" ON public.nss_applications 
    FOR UPDATE TO authenticated 
    USING (public.nss_is_coordinator(auth.uid()))
    WITH CHECK (public.nss_is_coordinator(auth.uid()));

-- Policy: nss_volunteer_directory
DROP POLICY IF EXISTS "Staff can manage directory" ON public.nss_volunteer_directory;
CREATE POLICY "Staff can manage directory" ON public.nss_volunteer_directory 
    FOR ALL TO authenticated 
    USING (public.nss_is_staff(auth.uid()))
    WITH CHECK (public.nss_is_coordinator(auth.uid()));

-- Policy: nss_email_logs
DROP POLICY IF EXISTS "Staff can view email logs" ON public.nss_email_logs;
CREATE POLICY "Staff can view email logs" ON public.nss_email_logs 
    FOR ALL TO authenticated 
    USING (public.nss_is_staff(auth.uid()))
    WITH CHECK (public.nss_is_coordinator(auth.uid()));

-- Policy: nss_audit_log
DROP POLICY IF EXISTS "Staff can view audit log" ON public.nss_audit_log;
CREATE POLICY "Staff can view audit log" ON public.nss_audit_log 
    FOR SELECT TO authenticated 
    USING (public.nss_is_staff(auth.uid()));

DROP POLICY IF EXISTS "System can insert audit log" ON public.nss_audit_log;
CREATE POLICY "System can insert audit log" ON public.nss_audit_log 
    FOR INSERT TO authenticated 
    WITH CHECK (true);

-- Policy: nss_leadership
DROP POLICY IF EXISTS "Public can view published leadership" ON public.nss_leadership;
CREATE POLICY "Public can view published leadership" ON public.nss_leadership 
    FOR SELECT 
    USING (published = TRUE OR (auth.role() = 'authenticated' AND public.nss_is_staff(auth.uid())));

DROP POLICY IF EXISTS "Coordinators manage leadership" ON public.nss_leadership;
CREATE POLICY "Coordinators manage leadership" ON public.nss_leadership 
    FOR ALL TO authenticated 
    USING (public.nss_is_coordinator(auth.uid()))
    WITH CHECK (public.nss_is_coordinator(auth.uid()));

-- ==============================================================================
-- 6.5. AUTOMATIC APPROVAL NOTIFICATION INFRASTRUCTURE
-- ==============================================================================
ALTER TABLE public.nss_applications ADD COLUMN IF NOT EXISTS email_notification_status TEXT DEFAULT 'pending';
ALTER TABLE public.nss_applications ADD COLUMN IF NOT EXISTS sms_notification_status TEXT DEFAULT 'pending';
ALTER TABLE public.nss_applications ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMPTZ;
ALTER TABLE public.nss_applications ADD COLUMN IF NOT EXISTS notification_error TEXT;

ALTER TABLE public.nss_students ADD COLUMN IF NOT EXISTS email_notification_status TEXT DEFAULT 'pending';
ALTER TABLE public.nss_students ADD COLUMN IF NOT EXISTS sms_notification_status TEXT DEFAULT 'pending';

CREATE TABLE IF NOT EXISTS public.nss_notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID REFERENCES public.nss_applications(id) ON DELETE CASCADE,
    volunteer_id TEXT,
    recipient_name TEXT,
    recipient_email TEXT,
    recipient_mobile TEXT,
    channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
    status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped', 'pending')),
    subject TEXT,
    provider_message_id TEXT,
    error_message TEXT,
    sent_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_nss_notif_app_id ON public.nss_notification_logs(application_id);
CREATE INDEX IF NOT EXISTS idx_nss_notif_channel ON public.nss_notification_logs(channel);
CREATE INDEX IF NOT EXISTS idx_nss_notif_status ON public.nss_notification_logs(status);

ALTER TABLE public.nss_notification_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view notification logs" ON public.nss_notification_logs;
CREATE POLICY "Staff can view notification logs" ON public.nss_notification_logs 
    FOR SELECT TO authenticated 
    USING (public.nss_is_staff(auth.uid()));

DROP POLICY IF EXISTS "System can insert notification logs" ON public.nss_notification_logs;
CREATE POLICY "System can insert notification logs" ON public.nss_notification_logs 
    FOR INSERT TO authenticated 
    WITH CHECK (true);

DROP POLICY IF EXISTS "Staff can update notification logs" ON public.nss_notification_logs;
CREATE POLICY "Staff can update notification logs" ON public.nss_notification_logs 
    FOR UPDATE TO authenticated 
    USING (public.nss_is_staff(auth.uid()));

-- ==============================================================================
-- 7. VERIFICATION QUERY
-- ==============================================================================
SELECT 
  (SELECT count(*) FROM public.nss_applications) AS total_applications,
  (SELECT count(*) FROM public.nss_students) AS total_students,
  (SELECT count(*) FROM public.nss_volunteer_directory) AS total_directory,
  (SELECT count(*) FROM public.nss_role_invitations) AS total_invitations,
  (SELECT count(*) FROM public.nss_roles) AS total_assigned_roles;
