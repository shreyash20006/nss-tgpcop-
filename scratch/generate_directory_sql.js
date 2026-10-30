const fs = require('fs');
const XLSX = require('xlsx');

const excelPath = 'C:\\Users\\91705\\Downloads\\4673_NSS EXCEL (1).xlsx';
const wb = XLSX.readFile(excelPath);
const ws = wb.Sheets['TGPCOP_Volunteer_Registration'];
const rows = XLSX.utils.sheet_to_json(ws);
const names = rows.map((r, i) => ({
  row: i + 2,
  name: (r['Full Name'] || '').toString().trim()
})).filter(x => x.name.length > 0);

console.log('Valid names extracted:', names.length);

const sqlHead = `-- ==============================================================================
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
`;

const inserts = names.map(n => {
  const safeName = n.name.replace(/'/g, "''");
  return `INSERT INTO public.nss_volunteer_directory (full_name, email, email_status, import_batch_id, source_row_number)
VALUES ('${safeName}', NULL, 'pending', 'BATCH-20261030-INIT', ${n.row})
ON CONFLICT (import_batch_id, source_row_number) DO UPDATE SET full_name = EXCLUDED.full_name;`;
}).join('\n');

const fullSql = sqlHead + '\n' + inserts + '\n\n-- Verify directory population\nSELECT count(*) AS total_directory_volunteers FROM public.nss_volunteer_directory;\n';

fs.writeFileSync('C:\\Users\\91705\\Downloads\\nss-tgpcop\\nss-directory-migration.sql', fullSql, 'utf8');
console.log('Wrote nss-directory-migration.sql successfully with', names.length, 'entries');

// Also write initial directory JSON / JS seed for instant frontend fallback
const seedJs = `/**
 * NSS Volunteer Directory Seed Data (Extracted strictly from 'Full Name')
 * Excludes all personal data, aadhaar, phone, DOB, address, and existing excel emails.
 */
(function() {
  window.NSS_DIRECTORY_SEED = ${JSON.stringify(names.map((n, idx) => ({
    id: 'dir-seed-' + (idx + 1),
    full_name: n.name,
    email: null,
    email_status: 'pending',
    import_batch_id: 'BATCH-20261030-INIT',
    source_row_number: n.row,
    created_at: new Date(Date.now() - (names.length - idx) * 3600000).toISOString()
  })), null, 2)};
})();
`;
fs.writeFileSync('C:\\Users\\91705\\Downloads\\nss-tgpcop\\directory-seed-data.js', seedJs, 'utf8');
console.log('Wrote directory-seed-data.js successfully');
