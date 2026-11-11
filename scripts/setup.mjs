#!/usr/bin/env node
/**
 * One-command local setup (Windows / macOS / Linux):
 *   npm run setup
 *
 * 1. Creates backend/.env and frontend/.env.local from the templates
 * 2. Generates JWT_SECRET and ENCRYPTION_KEY (never commit these)
 * 3. Starts MySQL, Redis, Elasticsearch with Docker and waits until healthy
 * 4. Installs dependencies for backend + frontend
 * 5. Runs the DB migration
 * 6. Tells you exactly what is still missing (only OAuth keys)
 *
 * Safe to run again: it never overwrites values you already filled in.
 */
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = (p) => join(root, 'backend', p);
const f = (p) => join(root, 'frontend', p);
const ok = (m) => console.log(`  \x1b[32m✔\x1b[0m ${m}`);
const warn = (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`);
const step = (m) => console.log(`\n\x1b[1m▶ ${m}\x1b[0m`);
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit', shell: true });

function setEnvValue(text, key, value) {
  const re = new RegExp(`^${key}=.*$`, 'm');
  return re.test(text) ? text.replace(re, `${key}=${value}`) : `${text}\n${key}=${value}\n`;
}
function getEnvValue(text, key) {
  return text.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim() ?? '';
}

// ---- 0. prerequisites
step('Checking prerequisites');
const major = Number(process.versions.node.split('.')[0]);
if (major < 22) {
  console.error(`  ✖ Node ${process.versions.node} found. Node 22+ is required (https://nodejs.org).`);
  process.exit(1);
}
ok(`Node ${process.versions.node}`);
try {
  execSync('docker info', { stdio: 'ignore' });
  ok('Docker is running');
} catch {
  console.error('  ✖ Docker is not running. Start Docker Desktop and run `npm run setup` again.');
  process.exit(1);
}

// ---- 1 + 2. env files with generated secrets
step('Creating env files');
if (!existsSync(b('.env'))) copyFileSync(b('.env.example'), b('.env'));
let env = readFileSync(b('.env'), 'utf8');
if (getEnvValue(env, 'JWT_SECRET').startsWith('replace-with') || getEnvValue(env, 'JWT_SECRET').length < 32) {
  env = setEnvValue(env, 'JWT_SECRET', randomBytes(32).toString('hex'));
  ok('Generated JWT_SECRET');
}
if (/^0+$/.test(getEnvValue(env, 'ENCRYPTION_KEY')) || getEnvValue(env, 'ENCRYPTION_KEY').length !== 64) {
  env = setEnvValue(env, 'ENCRYPTION_KEY', randomBytes(32).toString('hex'));
  ok('Generated ENCRYPTION_KEY');
}
if (getEnvValue(env, 'BULL_BOARD_PASS') === 'change-me') {
  const pass = randomBytes(6).toString('hex');
  env = setEnvValue(env, 'BULL_BOARD_PASS', pass);
  ok(`Bull Board login: admin / ${pass}  (saved in backend/.env)`);
}
writeFileSync(b('.env'), env);
if (!existsSync(f('.env.local'))) copyFileSync(f('.env.example'), f('.env.local'));
ok('backend/.env and frontend/.env.local ready');

// ---- 3. infra
step('Starting MySQL, Redis, Elasticsearch (first time downloads ~1 GB, be patient)');
run('docker compose up -d --wait');
ok('All containers healthy');

// ---- 4. deps
step('Installing root tools');
run('npm install');
step('Installing backend dependencies');
run('npm install', join(root, 'backend'));
step('Installing frontend dependencies');
run('npm install', join(root, 'frontend'));

// ---- 5. migrate
step('Creating database tables');
// The migration doesn't need OAuth keys; pass placeholders if they aren't filled in yet.
execSync('npm run migrate', {
  cwd: join(root, 'backend'), stdio: 'inherit', shell: true,
  env: {
    ...process.env,
    GOOGLE_CLIENT_ID: getEnvValue(env, 'GOOGLE_CLIENT_ID') || 'setup-placeholder',
    GOOGLE_CLIENT_SECRET: getEnvValue(env, 'GOOGLE_CLIENT_SECRET') || 'setup-placeholder',
  },
});

// ---- 6. what is left
step('Summary');
const missing = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'].filter((k) => !getEnvValue(env, k));
const slackMissing = ['SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET'].filter((k) => !getEnvValue(env, k));
if (missing.length) warn(`Still needed in backend/.env: ${missing.join(', ')}  ->  see SETUP_GUIDE.md step 3`);
else ok('Google OAuth configured');
if (slackMissing.length) warn('Slack not configured yet (optional, see step 6 of SETUP_GUIDE.md)');
else ok('Slack OAuth configured');
console.log(`
  Next:
    npm run dev                 # API + worker + frontend together
    open http://localhost:3000
    npm run verify              # automated tests (unit + Lua + restart/idempotency)
`);
