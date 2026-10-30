-- ==============================================================================
-- NSS TGPCOP - Volunteer Directory & Email Management Schema Migration
-- Website: https://nss.tgpcop.site
-- ==============================================================================

-- 1. Create nss_volunteer_directory table
CREATE TABLE IF NOT EXISTS public.nss_volunteer_directory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NULL,
  email_status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'added', 'verified', 'bounced'
  import_batch_id TEXT NOT NULL DEFAULT 'MANUAL',
  source_row_number INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_nss_vol_dir_name ON public.nss_volunteer_directory(full_name);
CREATE INDEX IF NOT EXISTS idx_nss_vol_dir_email ON public.nss_volunteer_directory(email);
CREATE INDEX IF NOT EXISTS idx_nss_vol_dir_batch ON public.nss_volunteer_directory(import_batch_id);

-- Constraint to prevent duplicate row import in same batch
CREATE UNIQUE INDEX IF NOT EXISTS idx_nss_vol_dir_batch_row 
  ON public.nss_volunteer_directory(import_batch_id, source_row_number)
  WHERE source_row_number IS NOT NULL;

-- 2. Create nss_email_logs table
CREATE TABLE IF NOT EXISTS public.nss_email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  directory_id UUID REFERENCES public.nss_volunteer_directory(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT NULL,
  subject TEXT NOT NULL,
  category TEXT NULL,
  template_id TEXT NULL,
  status TEXT NOT NULL DEFAULT 'sent', -- 'sent', 'failed', 'skipped'
  error_message TEXT NULL,
  batch_id TEXT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_nss_email_logs_date ON public.nss_email_logs(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_nss_email_logs_email ON public.nss_email_logs(recipient_email);

-- 3. Enable RLS
ALTER TABLE public.nss_volunteer_directory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nss_email_logs ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
DROP POLICY IF EXISTS "Coordinators manage directory" ON public.nss_volunteer_directory;
CREATE POLICY "Coordinators manage directory" ON public.nss_volunteer_directory
  FOR ALL TO authenticated
  USING (public.nss_is_coordinator(auth.uid()))
  WITH CHECK (public.nss_is_coordinator(auth.uid()));

DROP POLICY IF EXISTS "Coordinators view email logs" ON public.nss_email_logs;
CREATE POLICY "Coordinators view email logs" ON public.nss_email_logs
  FOR ALL TO authenticated
  USING (public.nss_is_coordinator(auth.uid()))
  WITH CHECK (public.nss_is_coordinator(auth.uid()));

-- 5. Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.nss_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_nss_vol_dir_timestamp ON public.nss_volunteer_directory;
CREATE TRIGGER trigger_nss_vol_dir_timestamp
  BEFORE UPDATE ON public.nss_volunteer_directory
  FOR EACH ROW
  EXECUTE FUNCTION public.nss_update_timestamp();

-- 6. Pre-seed official volunteer names from 4673_NSS EXCEL (1).xlsx
-- Strictly ONLY Full Name is stored. All personal data, phone, aadhaar, DOB, address, and excel emails are completely excluded.

INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Shreyash Siddhart Bhaisare', NULL, 'pending', 'BATCH-20261030-INIT', 2)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Roshan Swami Rodawar', NULL, 'pending', 'BATCH-20261030-INIT', 3)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Aryan Suraj Gaimukhe', NULL, 'pending', 'BATCH-20261030-INIT', 4)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Kunal Pradip Patil', NULL, 'pending', 'BATCH-20261030-INIT', 5)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Rohan Diliprao Dhobale', NULL, 'pending', 'BATCH-20261030-INIT', 6)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Sujal Raju Rathod', NULL, 'pending', 'BATCH-20261030-INIT', 7)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Shruti Digambar Ghanode', NULL, 'pending', 'BATCH-20261030-INIT', 8)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Simran Sanjay Meshram', NULL, 'pending', 'BATCH-20261030-INIT', 9)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Gauri Mukesh Kadu', NULL, 'pending', 'BATCH-20261030-INIT', 10)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Khushi Mohan Paradkar', NULL, 'pending', 'BATCH-20261030-INIT', 11)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Shruti Sukhdev Irkhede', NULL, 'pending', 'BATCH-20261030-INIT', 12)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Neha Kumari Tarkeshwar Yadav', NULL, 'pending', 'BATCH-20261030-INIT', 13)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Komal Shyamji Dadmal', NULL, 'pending', 'BATCH-20261030-INIT', 14)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Jannat Jamir Sheikh', NULL, 'pending', 'BATCH-20261030-INIT', 15)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Pragati Ishwardas Bhelave', NULL, 'pending', 'BATCH-20261030-INIT', 16)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Isha Arjun Nanhe', NULL, 'pending', 'BATCH-20261030-INIT', 17)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Ankita Hemraj Wangekar', NULL, 'pending', 'BATCH-20261030-INIT', 18)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Ramani Ravindra Niswade', NULL, 'pending', 'BATCH-20261030-INIT', 19)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Monali Vishwanath Meshram', NULL, 'pending', 'BATCH-20261030-INIT', 20)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Sanika Ghanashyamji Khunkar', NULL, 'pending', 'BATCH-20261030-INIT', 21)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Mandar Pravin Bandre', NULL, 'pending', 'BATCH-20261030-INIT', 22)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Nayan Prafull Thote', NULL, 'pending', 'BATCH-20261030-INIT', 23)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Saloni Mangesh Navnage', NULL, 'pending', 'BATCH-20261030-INIT', 24)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Priti Ajay Mehra', NULL, 'pending', 'BATCH-20261030-INIT', 25)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Sandesh Raju Nannaware', NULL, 'pending', 'BATCH-20261030-INIT', 26)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Arpit Pradip Rakhade', NULL, 'pending', 'BATCH-20261030-INIT', 27)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Anjali Ashok Hardas', NULL, 'pending', 'BATCH-20261030-INIT', 28)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Purvi Raju Sahahre', NULL, 'pending', 'BATCH-20261030-INIT', 29)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Abhishek Dipak kale', NULL, 'pending', 'BATCH-20261030-INIT', 30)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Suhani Nivas Yeole', NULL, 'pending', 'BATCH-20261030-INIT', 31)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Harshal Ganesh Hatwar', NULL, 'pending', 'BATCH-20261030-INIT', 32)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Rahul UddinWarkhade', NULL, 'pending', 'BATCH-20261030-INIT', 33)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Prajwal Tejram Khergade', NULL, 'pending', 'BATCH-20261030-INIT', 34)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Chaitalu Sayman Umbarkar', NULL, 'pending', 'BATCH-20261030-INIT', 35)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Chhakuli Shivshankar Choudhari', NULL, 'pending', 'BATCH-20261030-INIT', 36)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Sumit Ganesh Butle', NULL, 'pending', 'BATCH-20261030-INIT', 37)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Nidhi Jiwanlal Bhagat', NULL, 'pending', 'BATCH-20261030-INIT', 38)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Harshika Gopal Wankhede', NULL, 'pending', 'BATCH-20261030-INIT', 39)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Mahesh Shivalal Chodhari', NULL, 'pending', 'BATCH-20261030-INIT', 40)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Umesh Ramchandra Wadhai', NULL, 'pending', 'BATCH-20261030-INIT', 41)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Ujwal Mohan Fulekar', NULL, 'pending', 'BATCH-20261030-INIT', 42)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Nilesh Shrikrishna Godghate', NULL, 'pending', 'BATCH-20261030-INIT', 43)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Yash Dhanraj Utkhede', NULL, 'pending', 'BATCH-20261030-INIT', 44)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Netra Atul Sherkar', NULL, 'pending', 'BATCH-20261030-INIT', 45)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Aboli Anil Nane', NULL, 'pending', 'BATCH-20261030-INIT', 46)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Prachi Ashok Ambuskar', NULL, 'pending', 'BATCH-20261030-INIT', 47)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Disha Dilip Bhave', NULL, 'pending', 'BATCH-20261030-INIT', 48)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Laksh Kamlesh Jaiswal', NULL, 'pending', 'BATCH-20261030-INIT', 49)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('Madhavi Bhimrao Kherkar', NULL, 'pending', 'BATCH-20261030-INIT', 50)
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;

-- Verify directory population
SELECT count(*) AS total_directory_volunteers FROM public.nss_volunteer_directory;
