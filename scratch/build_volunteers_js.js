const fs = require('fs');

const volunteers = JSON.parse(fs.readFileSync('C:/Users/91705/Downloads/nss-tgpcop/data/volunteers.json', 'utf8'));

const js = `/**
 * Official Enrolled NSS Volunteers Roster (2025–2026)
 * Unit: NSS Unit 1 (Pharmacy Cell)
 * Institution: Tulsiramji Gaikwad-Patil College of Pharmacy, Nagpur
 * Total Active Volunteers: ${volunteers.length}
 */
(function() {
  window.NSS_VOLUNTEERS_DATA = ${JSON.stringify(volunteers, null, 2)};
})();
`;

fs.writeFileSync('C:/Users/91705/Downloads/nss-tgpcop/volunteers-data.js', js, 'utf8');
console.log('Created volunteers-data.js with', volunteers.length, 'records.');
