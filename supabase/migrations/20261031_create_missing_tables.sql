-- ==============================================================================
-- NSS TGPCOP PORTAL — NON-DESTRUCTIVE SQL MIGRATION FOR MISSING TABLES
-- Tables: public.nss_students, public.nss_login_activity
-- ==============================================================================

-- 1. CENTRALIZED STUDENT REGISTRY (nss_students)
CREATE TABLE IF NOT EXISTS public.nss_students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    google_email TEXT,
    college_email TEXT,
    google_avatar_url TEXT,
    roll_number TEXT,
    prn TEXT,
    course TEXT DEFAULT 'B.Pharm',
    academic_year TEXT DEFAULT 'FY',
    division TEXT,
    department TEXT DEFAULT 'Pharmacy',
    mobile TEXT,
    emergency_contact TEXT,
    registration_id UUID REFERENCES public.nss_applications(id) ON DELETE SET NULL,
    application_status TEXT NOT NULL DEFAULT 'not_registered' 
      CHECK (application_status IN ('not_registered', 'pending', 'approved', 'rejected', 'revoked')),
    volunteer_id TEXT,
    approval_date TIMESTAMPTZ,
    approved_by UUID REFERENCES auth.users(id),
    data_source TEXT NOT NULL DEFAULT 'web_registration',
    import_batch_id TEXT,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP INDEX IF EXISTS public.idx_nss_students_roll;
CREATE UNIQUE INDEX IF NOT EXISTS idx_nss_students_roll ON public.nss_students(roll_number);

CREATE INDEX IF NOT EXISTS idx_nss_students_user ON public.nss_students(user_id);
CREATE INDEX IF NOT EXISTS idx_nss_students_email ON public.nss_students(LOWER(google_email));
CREATE INDEX IF NOT EXISTS idx_nss_students_coll_email ON public.nss_students(LOWER(college_email));
CREATE INDEX IF NOT EXISTS idx_nss_students_status ON public.nss_students(application_status);
CREATE INDEX IF NOT EXISTS idx_nss_students_prn ON public.nss_students(prn);
CREATE INDEX IF NOT EXISTS idx_nss_students_reg_id ON public.nss_students(registration_id);

INSERT INTO public.nss_students (
  user_id, full_name, college_email, roll_number, prn, course, academic_year,
  division, mobile, registration_id, application_status, volunteer_id, created_at, updated_at
)
SELECT 
  a.user_id, a.full_name, a.college_email, a.roll_number, a.prn, a.course, a.academic_year,
  a.division, a.mobile, a.id, a.status, a.volunteer_id, a.submitted_at, NOW()
FROM public.nss_applications a
WHERE NOT EXISTS (
  SELECT 1 FROM public.nss_students s 
  WHERE s.registration_id = a.id 
     OR (a.roll_number IS NOT NULL AND s.roll_number = a.roll_number)
);

UPDATE public.nss_students s
SET 
  application_status = a.status,
  volunteer_id = COALESCE(a.volunteer_id, s.volunteer_id),
  user_id = COALESCE(a.user_id, s.user_id),
  updated_at = NOW()
FROM public.nss_applications a
WHERE s.registration_id = a.id OR (a.roll_number IS NOT NULL AND s.roll_number = a.roll_number);

ALTER TABLE public.nss_students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students can view own profile" ON public.nss_students;
CREATE POLICY "Students can view own profile" ON public.nss_students FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.nss_is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff can manage student records" ON public.nss_students;
CREATE POLICY "Staff can manage student records" ON public.nss_students FOR ALL TO authenticated USING (public.nss_is_staff(auth.uid())) WITH CHECK (public.nss_is_staff(auth.uid()));

DROP POLICY IF EXISTS "Anon count students" ON public.nss_students;
CREATE POLICY "Anon count students" ON public.nss_students FOR SELECT TO anon USING (true);

-- 2. LOGIN TRACKING TABLE (nss_login_activity)
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

ALTER TABLE public.nss_login_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view login activity" ON public.nss_login_activity;
CREATE POLICY "Staff can view login activity" ON public.nss_login_activity FOR SELECT TO authenticated USING (public.nss_is_staff(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users insert own login" ON public.nss_login_activity;
CREATE POLICY "Authenticated users insert own login" ON public.nss_login_activity FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR public.nss_is_staff(auth.uid()));

DROP POLICY IF EXISTS "Anon insert login activity" ON public.nss_login_activity;
CREATE POLICY "Anon insert login activity" ON public.nss_login_activity FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Anon count login activity" ON public.nss_login_activity;
CREATE POLICY "Anon count login activity" ON public.nss_login_activity FOR SELECT TO anon USING (true);
