const fs = require('fs');
const volunteers = JSON.parse(fs.readFileSync('C:/Users/91705/Downloads/nss-tgpcop/data/volunteers.json', 'utf8'));

function escapeSql(str) {
  if (str === null || str === undefined) return 'NULL';
  return "'" + String(str).replace(/'/g, "''") + "'";
}

let sql = `-- ==============================================================================
-- NSS TGPCOP - 49 Official Enrolled Volunteers Seed Script
-- Institution: Tulsiramji Gaikwad-Patil College of Pharmacy, Nagpur
-- Table: public.nss_applications
-- ==============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Seeding 49 official enrolled NSS volunteers into nss_applications...';
END $$;

`;

for (const v of volunteers) {
  const volId = v.sr_no === 2 ? 'NSS-TGP-26-000007' : v.volunteer_id;
  const rollNo = v.roll_number;

  sql += `
INSERT INTO public.nss_applications (
    ref_code,
    volunteer_id,
    full_name,
    roll_number,
    prn,
    course,
    academic_year,
    division,
    college_email,
    personal_email,
    mobile,
    emergency_contact,
    status,
    qr_token_hash,
    submitted_at,
    reviewed_at,
    consent
) VALUES (
    ${escapeSql(v.ref_code)},
    ${escapeSql(volId)},
    ${escapeSql(v.full_name)},
    ${escapeSql(rollNo)},
    ${escapeSql(v.prn)},
    ${escapeSql(v.course)},
    ${escapeSql(v.academic_year)},
    ${escapeSql(v.division)},
    ${escapeSql(v.college_email)},
    ${escapeSql(v.personal_email)},
    ${escapeSql(v.mobile)},
    ${escapeSql(v.emergency_contact)},
    'approved',
    ${escapeSql(v.qr_token_hash)},
    NOW() - INTERVAL '${50 - v.sr_no} days',
    NOW() - INTERVAL '${50 - v.sr_no} days',
    TRUE
)
ON CONFLICT (roll_number) DO UPDATE SET
    volunteer_id = EXCLUDED.volunteer_id,
    full_name = EXCLUDED.full_name,
    prn = EXCLUDED.prn,
    course = EXCLUDED.course,
    academic_year = EXCLUDED.academic_year,
    division = EXCLUDED.division,
    college_email = EXCLUDED.college_email,
    personal_email = EXCLUDED.personal_email,
    mobile = EXCLUDED.mobile,
    emergency_contact = EXCLUDED.emergency_contact,
    status = 'approved',
    qr_token_hash = EXCLUDED.qr_token_hash,
    reviewed_at = COALESCE(public.nss_applications.reviewed_at, NOW());
`;
}

sql += `
-- Advance volunteer ID sequence to 50 so future approvals start at 50
SELECT setval('public.nss_volunteer_seq', GREATEST(nextval('public.nss_volunteer_seq'), 50), true);

DO $$
BEGIN
    RAISE NOTICE 'Successfully seeded 49 NSS volunteers with approved active credentials!';
END $$;
`;

fs.writeFileSync('C:/Users/91705/Downloads/nss-tgpcop/nss-seed-volunteers.sql', sql, 'utf8');
console.log('nss-seed-volunteers.sql generated successfully. Total length:', sql.length);
