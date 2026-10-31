-- NSS TGPCOP: self-service approval and approved count
-- Run once in the Supabase SQL Editor after deploying the matching frontend.
-- This preserves current RLS policies. Students can approve only their own
-- pending application; coordinator approval continues to work as before.

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

    SELECT * INTO v_app
    FROM public.nss_applications
    WHERE id = app_id AND status = 'pending';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Application not found or is not in pending status';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.nss_roles WHERE user_id = auth.uid()
    ) INTO v_is_coordinator;

    IF NOT v_is_coordinator AND v_app.user_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: applicants can only approve their own application';
    END IF;

    v_seq := nextval('public.nss_volunteer_seq');
    v_year := TO_CHAR(NOW(), 'YY');
    v_volunteer_id := 'NSS-TGP-' || v_year || '-' || LPAD(v_seq::TEXT, 6, '0');
    v_token := encode(gen_random_bytes(32), 'hex');
    v_token_hash := encode(digest(v_token, 'sha256'), 'hex');

    UPDATE public.nss_applications
    SET status = 'approved',
        volunteer_id = v_volunteer_id,
        qr_token_hash = v_token_hash,
        reviewed_at = NOW(),
        reviewed_by = CASE WHEN v_is_coordinator THEN auth.uid() ELSE NULL END
    WHERE id = app_id;

    INSERT INTO public.nss_audit_log (application_id, action, performed_by, details)
    VALUES (
        app_id,
        'approved',
        auth.uid(),
        CASE WHEN v_is_coordinator THEN 'Coordinator approved. ' ELSE 'Self-service auto-approval. ' END
          || 'Assigned Volunteer ID: ' || v_volunteer_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'volunteer_id', v_volunteer_id,
        'qr_token', v_token
    );
END;
$$;

-- Convert current pending applications once, assigning real IDs and QR hashes.
-- This is intentionally separate from the RPC: it runs as the database owner
-- in the SQL Editor, leaves reviewed_by NULL, and records the batch in the audit log.
DO $$
DECLARE
    v_app RECORD;
    v_seq BIGINT;
    v_volunteer_id TEXT;
    v_token TEXT;
    v_token_hash TEXT;
    v_year TEXT;
BEGIN
    FOR v_app IN
        SELECT id
        FROM public.nss_applications
        WHERE status = 'pending'
        ORDER BY submitted_at NULLS FIRST, id
        FOR UPDATE
    LOOP
        v_seq := nextval('public.nss_volunteer_seq');
        v_year := TO_CHAR(NOW(), 'YY');
        v_volunteer_id := 'NSS-TGP-' || v_year || '-' || LPAD(v_seq::TEXT, 6, '0');
        v_token := encode(gen_random_bytes(32), 'hex');
        v_token_hash := encode(digest(v_token, 'sha256'), 'hex');

        UPDATE public.nss_applications
        SET status = 'approved',
            volunteer_id = v_volunteer_id,
            qr_token_hash = v_token_hash,
            reviewed_at = NOW(),
            reviewed_by = NULL
        WHERE id = v_app.id;

        UPDATE public.nss_students
        SET application_status = 'approved',
            volunteer_id = v_volunteer_id,
            approval_date = NOW(),
            updated_at = NOW()
        WHERE registration_id = v_app.id;

        INSERT INTO public.nss_audit_log (application_id, action, performed_by, details)
        VALUES (v_app.id, 'approved', NULL, 'Batch auto-approval. Assigned Volunteer ID: ' || v_volunteer_id);
    END LOOP;
END;
$$;
