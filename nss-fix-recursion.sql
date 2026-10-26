-- ==============================================================================
-- NSS TGPCOP — Fix Infinite Recursion on nss_roles & Grant Super Admin
-- Execute this script in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/gdwfptmtvzdfjcduhcvg/sql
-- ==============================================================================

-- 1. Create SECURITY DEFINER helper functions (bypasses RLS recursion safely)
CREATE OR REPLACE FUNCTION public.nss_is_coordinator(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.nss_roles
    WHERE user_id = p_user_id
      AND role IN ('coordinator', 'super_admin')
  );
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
    WHERE user_id = p_user_id
      AND role = 'super_admin'
  );
$$;

-- 2. Drop existing problematic recursive policies on nss_roles
DROP POLICY IF EXISTS "Admins can read nss_roles" ON public.nss_roles;
DROP POLICY IF EXISTS "Super admin manages roles" ON public.nss_roles;
DROP POLICY IF EXISTS "Users can read own role" ON public.nss_roles;
DROP POLICY IF EXISTS "Super admins can manage roles" ON public.nss_roles;

-- 3. Create non-recursive policies on nss_roles
-- Authenticated users can read their own role (Direct comparison = ZERO recursion)
CREATE POLICY "Users can read own role" ON public.nss_roles 
    FOR SELECT TO authenticated 
    USING (auth.uid() = user_id);

-- Super admins manage roles via SECURITY DEFINER function
CREATE POLICY "Super admins can manage roles" ON public.nss_roles 
    FOR ALL TO authenticated 
    USING (public.nss_is_super_admin(auth.uid()))
    WITH CHECK (public.nss_is_super_admin(auth.uid()));

-- 4. Update nss_applications policies to use SECURITY DEFINER helper
DROP POLICY IF EXISTS "Coordinator can view all applications" ON public.nss_applications;
CREATE POLICY "Coordinator can view all applications" ON public.nss_applications 
    FOR SELECT TO authenticated 
    USING (public.nss_is_coordinator(auth.uid()));

DROP POLICY IF EXISTS "Coordinator can update applications" ON public.nss_applications;
CREATE POLICY "Coordinator can update applications" ON public.nss_applications 
    FOR UPDATE TO authenticated 
    USING (public.nss_is_coordinator(auth.uid()));

-- 5. Update nss_audit_log policy
DROP POLICY IF EXISTS "Coordinators can read audit log" ON public.nss_audit_log;
CREATE POLICY "Coordinators can read audit log" ON public.nss_audit_log 
    FOR SELECT TO authenticated 
    USING (public.nss_is_coordinator(auth.uid()));

-- 6. Update nss_leadership policy (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'nss_leadership') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Coordinators manage leadership" ON public.nss_leadership';
    EXECUTE 'CREATE POLICY "Coordinators manage leadership" ON public.nss_leadership FOR ALL TO authenticated USING (public.nss_is_coordinator(auth.uid()))';
  END IF;
END $$;

-- 7. Ensure your account (sb108750@gmail.com) has super_admin role granted
INSERT INTO public.nss_roles (user_id, role)
SELECT id, 'super_admin'
FROM auth.users
WHERE email = 'sb108750@gmail.com'
ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin';

-- 8. Verify the fix (Returns your assigned role)
SELECT 
    u.email,
    r.role,
    r.created_at
FROM public.nss_roles r
JOIN auth.users u ON u.id = r.user_id
WHERE u.email = 'sb108750@gmail.com';
