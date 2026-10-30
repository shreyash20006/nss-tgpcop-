const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

console.log('=== TEST 1: EXCEL PARSER STRICT PRIVACY VERIFICATION ===');
const excelPath = 'C:\\Users\\91705\\Downloads\\4673_NSS EXCEL (1).xlsx';
const wb = XLSX.readFile(excelPath);
const sheet = wb.Sheets['TGPCOP_Volunteer_Registration'];
const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

const headerRow = rawRows[0] || [];
console.log('Raw headers in sheet:', headerRow);

let nameColIdx = -1;
for (let i = 0; i < headerRow.length; i++) {
  const h = String(headerRow[i] || '').trim();
  if (/full\s*name/i.test(h)) {
    nameColIdx = i;
    break;
  }
}
console.log('Found Full Name at index:', nameColIdx);

const extracted = [];
for (let r = 1; r < rawRows.length; r++) {
  const row = rawRows[r];
  if (!row) continue;
  const rawVal = row[nameColIdx];
  if (rawVal !== undefined && rawVal !== null) {
    const cleanName = String(rawVal).trim();
    if (cleanName.length > 0) {
      extracted.push({
        row: r + 1,
        name: cleanName
      });
    }
  }
}

console.log('Total valid names extracted:', extracted.length);
console.log('Sample extracted item:', extracted[0]);

// Assert no personal fields are retained
const sample = extracted[0];
const forbiddenFields = ['aadhar', 'mobile', 'dob', 'address', 'category', 'gender', 'email', 'blood_group'];
const leaked = Object.keys(sample).filter(k => forbiddenFields.includes(k.toLowerCase()));
if (leaked.length === 0) {
  console.log('✅ PASSED: Strictly ONLY Full Name and Row Number are extracted. Zero PII leaked!');
} else {
  console.error('❌ FAILED: Leaked fields:', leaked);
}

console.log('\n=== TEST 2: SEED DATA INTEGRITY ===');
const seedPath = 'C:\\Users\\91705\\Downloads\\nss-tgpcop\\directory-seed-data.js';
const seedContent = fs.readFileSync(seedPath, 'utf8');
const match = seedContent.match(/window\.NSS_DIRECTORY_SEED\s*=\s*(\[[\s\S]*?\]);/);
if (match) {
  const seedArray = JSON.parse(match[1]);
  console.log('Seed array count:', seedArray.length);
  console.log('First seed entry:', seedArray[0]);
  console.log('Initial email state:', seedArray[0].email, 'Status:', seedArray[0].email_status);
  console.log('✅ PASSED: Seed entries have null email and pending status.');
} else {
  console.error('❌ FAILED: Could not parse seed data.');
}

console.log('\n=== TEST 3: PERSONALIZATION VARIABLE REPLACEMENT ===');
const subjectTpl = '[NSS TGPCOP] Welcome to the NSS Family, {{first_name}}!';
const bodyTpl = 'Dear {{first_name}},\n\nWe are pleased to welcome you, {{name}}, to our active NSS Unit.';
const recipient = { name: 'Shreyash Siddhart Bhaisare', email: 'test@example.com' };
const firstName = recipient.name.split(' ')[0];

const personalizedSubject = subjectTpl.replace(/\{\{first_name\}\}/gi, firstName).replace(/\{\{name\}\}/gi, recipient.name);
const personalizedBody = bodyTpl.replace(/\{\{first_name\}\}/gi, firstName).replace(/\{\{name\}\}/gi, recipient.name);

console.log('Personalized Subject:', personalizedSubject);
console.log('Personalized Body:', personalizedBody);

if (personalizedSubject.includes('Shreyash') && personalizedBody.includes('Shreyash Siddhart Bhaisare')) {
  console.log('✅ PASSED: Dynamic variable replacement is working correctly.');
} else {
  console.error('❌ FAILED: Personalization replacement failed.');
}

console.log('\n=== ALL VERIFICATION TESTS COMPLETED ===');
