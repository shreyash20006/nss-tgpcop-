const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const distDir = path.join(rootDir, 'dist');
const publicDir = path.join(rootDir, 'public');

function getEnv() {
  const envVars = {
    SUPABASE_URL: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
    CLOUDINARY_LOGO_URL: process.env.CLOUDINARY_LOGO_URL || process.env.VITE_CLOUDINARY_LOGO_URL || ''
  };

  const envFile = path.join(rootDir, '.env');
  if (!envVars.SUPABASE_URL && fs.existsSync(envFile)) {
    const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [k, ...v] = trimmed.split('=');
      if (k) envVars[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
    }
  }
  return envVars;
}

const env = getEnv();
const envScript = `window.__ENV__ = ${JSON.stringify(env, null, 2)};\n`;
fs.writeFileSync(path.join(rootDir, 'env.js'), envScript, 'utf8');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

fs.writeFileSync(path.join(distDir, 'env.js'), envScript, 'utf8');
fs.writeFileSync(path.join(publicDir, 'env.js'), envScript, 'utf8');

const staticFiles = [
  'nss.html',
  'nss-register.html',
  'nss-status.html',
  'nss-my-id.html',
  'nss-verify.html',
  'nss-login.html',
  'nss-admin.html',
  'nss.css',
  'nss.js',
  'echo.css',
  'echo.js',
  'env.js',
  'echo_logo_white_transparent.png'
];

for (const file of staticFiles) {
  const src = path.join(rootDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(distDir, file));
    fs.copyFileSync(src, path.join(publicDir, file));
  }
}

const assetsDir = path.join(rootDir, 'assets');
if (fs.existsSync(assetsDir)) {
  const distAssets = path.join(distDir, 'assets');
  const publicAssets = path.join(publicDir, 'assets');
  if (!fs.existsSync(distAssets)) fs.mkdirSync(distAssets, { recursive: true });
  if (!fs.existsSync(publicAssets)) fs.mkdirSync(publicAssets, { recursive: true });
  fs.readdirSync(assetsDir).forEach(f => {
    fs.copyFileSync(path.join(assetsDir, f), path.join(distAssets, f));
    fs.copyFileSync(path.join(assetsDir, f), path.join(publicAssets, f));
  });
}

console.log('NSS Portal build completed successfully for Vercel deployment.');
