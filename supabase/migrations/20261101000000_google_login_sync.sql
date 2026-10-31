-- Restore reliable Google login tracking without weakening volunteer/student RLS.
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
  v_application public.nss_applications;
  v_registered BOOLEAN := FALSE;
  v_roll TEXT;
  v_course TEXT;
  v_year TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required to record login activity.' USING ERRCODE = '42501';
  END IF;

  SELECT email,
         COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name'),
         COALESCE(raw_user_meta_data->>'avatar_url', raw_user_meta_data->>'picture')
    INTO v_email, v_name, v_avatar
    FROM auth.users
   WHERE id = v_uid;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated account was not found.';
  END IF;

  -- Keep the existing invitation activation and database-backed role logic.
  v_role := public.nss_check_and_activate_invitation(v_uid, v_email);
  IF v_role IS NULL THEN v_role := 'volunteer'; END IF;

  SELECT * INTO v_student
    FROM public.nss_students
   WHERE user_id = v_uid
   LIMIT 1;

  IF FOUND THEN
    v_registered := v_student.application_status IN ('approved', 'pending');
    v_roll := v_student.roll_number;
    v_course := v_student.course;
    v_year := v_student.academic_year;

    UPDATE public.nss_students
       SET last_login_at = NOW(),
           google_email = COALESCE(google_email, v_email),
           google_avatar_url = COALESCE(google_avatar_url, v_avatar)
     WHERE id = v_student.id;
  ELSE
    -- Applications are the source of truth for new volunteers; do not make them
    -- disappear from the admin login list while the registry is being synced.
    SELECT * INTO v_application
      FROM public.nss_applications
     WHERE user_id = v_uid
     ORDER BY submitted_at DESC NULLS LAST
     LIMIT 1;

    IF FOUND THEN
      v_registered := v_application.status IN ('approved', 'pending');
      v_roll := v_application.roll_number;
      v_course := v_application.course;
      v_year := v_application.academic_year;
    END IF;
  END IF;

  INSERT INTO public.nss_login_activity (
    user_id, email, full_name, avatar_url, role, is_registered,
    roll_number, course, academic_year, ip_address, user_agent, login_at
  ) VALUES (
    v_uid, v_email, COALESCE(v_name, v_email), v_avatar, v_role, v_registered,
    v_roll, v_course, v_year, p_ip_address, p_user_agent, NOW()
  );

  RETURN jsonb_build_object(
    'success', TRUE, 'role', v_role, 'is_registered', v_registered,
    'email', v_email, 'name', COALESCE(v_name, v_email)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.nss_record_login(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nss_record_login(TEXT, TEXT) TO authenticated;

-- Login events contain personal data; only authenticated staff can read them.
DROP POLICY IF EXISTS "Anon insert login activity" ON public.nss_login_activity;
DROP POLICY IF EXISTS "Anon count login activity" ON public.nss_login_activity;
