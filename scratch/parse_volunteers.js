const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const csvPath = 'C:/Users/91705/Downloads/nss-tgpcop/data/volunteers.csv';
const content = fs.readFileSync(csvPath, 'utf8');

function parseCSV(text) {
  const lines = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i+1];
    
    if (c === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push(cell.trim());
      cell = '';
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') i++;
      row.push(cell.trim());
      if (row.length > 1) lines.push(row);
      row = [];
      cell = '';
    } else {
      cell += c;
    }
  }
  if (cell || row.length) {
    row.push(cell.trim());
    if (row.length > 1) lines.push(row);
  }
  return lines;
}

const rows = parseCSV(content);
const volunteers = [];

for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  const srNo = parseInt(r[0], 10) || i;
  const aadhar = (r[1] || '').trim();
  const fullName = (r[2] || '').trim().replace(/\s+/g, ' ');
  const parentName = (r[3] || '').trim().replace(/\s+/g, ' ');
  const gender = (r[4] || '').trim();
  const dob = (r[5] || '').trim();
  const category = (r[6] || '').trim();
  const classStudying = (r[7] || '').trim();
  const mainSubject = (r[8] || '').trim();
  const address = (r[9] || '').trim();
  const landmark = (r[10] || '').trim();
  const state = (r[11] || '').trim();
  const district = (r[12] || '').trim();
  const pincode = (r[13] || '').trim();
  let email = (r[14] || '').trim().toLowerCase().replace(/\s+/g, '');
  
  // Fix known typos
  if (email.includes('gamil.com')) email = email.replace('gamil.com', 'gmail.com');
  if (email === 'prajwalkhergade12gmail.com') email = 'prajwalkhergade12@gmail.com';
  
  const mobile = (r[15] || '').trim().replace(/[^0-9]/g, '');
  const bloodGroup = (r[16] || '').trim().toUpperCase();
  const createdBy = (r[17] || '').trim();
  const interests = (r[18] || '').trim().replace(/🏏/g, '').trim();

  // Academic year mapping
  let year = 'FY';
  if (classStudying.includes('2nd') || classStudying.includes('Second')) {
    year = 'SY';
  } else if (classStudying.includes('3rd') || classStudying.includes('Third')) {
    year = 'TY';
  } else if (classStudying.includes('4th') || classStudying.includes('Fourth')) {
    year = 'Fourth Year';
  }

  // Roll number: keep 3065 for Roshan Rodawar (row 2)
  const rollNumber = srNo === 2 ? '3065' : `TGP-26-${String(srNo).padStart(3, '0')}`;
  const volunteerId = `NSS-TGP-26-${String(srNo).padStart(6, '0')}`;
  const refCode = `NSS-REF-2026-${String(srNo).padStart(4, '0')}`;
  
  // Deterministic token & hash
  const rawToken = `NSS_TGPCOP_${srNo}_${aadhar.slice(-4)}_${mobile.slice(-4)}`;
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  // Masked Aadhar for safe public presentation
  const maskedAadhar = aadhar ? `XXXX-XXXX-${aadhar.slice(-4)}` : null;

  volunteers.push({
    sr_no: srNo,
    full_name: fullName,
    parent_name: parentName,
    roll_number: rollNumber,
    prn: aadhar || null,
    masked_aadhar: maskedAadhar,
    course: 'B.Pharm',
    academic_year: year,
    class_label: classStudying,
    division: 'A',
    college_email: email,
    personal_email: email,
    mobile: mobile,
    emergency_contact: mobile,
    gender: gender,
    date_of_birth: dob,
    category: category,
    address: `${address}${landmark ? ', ' + landmark : ''}`,
    city_district: district,
    state: state,
    pincode: pincode,
    full_address: `${address}${landmark ? ', ' + landmark : ''}, ${district}, ${state} - ${pincode}`,
    blood_group: bloodGroup,
    interests: interests,
    status: 'approved',
    volunteer_id: volunteerId,
    ref_code: refCode,
    qr_token: rawToken,
    qr_token_hash: tokenHash
  });
}

fs.writeFileSync('C:/Users/91705/Downloads/nss-tgpcop/data/volunteers.json', JSON.stringify(volunteers, null, 2), 'utf8');
console.log('Processed and cleaned 49 volunteers successfully.');
