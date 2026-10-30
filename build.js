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
  'index.html',
  'nss.html',
  'login.html',
  'nss-login.html',
  'register.html',
  'nss-register.html',
  'status.html',
  'application-status.html',
  'nss-status.html',
  'my-id.html',
  'nss-my-id.html',
  'verify.html',
  'nss-verify.html',
  'admin.html',
  'nss-admin.html',
  'nss.css',
  'nss.js',
  'echo.css',
  'echo.js',
  'env.js',
  'volunteers-data.js',
  'directory-seed-data.js',
  'cloudinary-config.js',
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

const imagesDir = path.join(rootDir, 'images');
if (fs.existsSync(imagesDir)) {
  for (const out of [distDir, publicDir]) {
    const dst = path.join(out, 'images');
    if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
    fs.readdirSync(imagesDir).forEach(f => fs.copyFileSync(path.join(imagesDir, f), path.join(dst, f)));
  }
}


const apiDir = path.join(rootDir, 'api');
if (fs.existsSync(apiDir)) {
  // Only copy to public mirror, leave dist free of static api override so Vercel functions take priority
  const publicApi = path.join(publicDir, 'api');
  if (!fs.existsSync(publicApi)) fs.mkdirSync(publicApi, { recursive: true });
  fs.readdirSync(apiDir).forEach(f => fs.copyFileSync(path.join(apiDir, f), path.join(publicApi, f)));

  // If dist/api was created previously, remove it to prevent static file collision with Vercel Serverless Functions
  const distApi = path.join(distDir, 'api');
  if (fs.existsSync(distApi)) {
    fs.rmSync(distApi, { recursive: true, force: true });
  }
}

console.log('NSS Portal build completed successfully for Vercel deployment.');
