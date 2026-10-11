// One-time Google setup, safe to re-run: each step skips if it's already done. Mirrors skills/invite-builder.
//   login → create the Sheet + script → push → (host sets up tabs) → create the one deployment → write api_url → deploy
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const app = path.join(__dirname, '..');
const gas = path.join(app, 'gas');
const eventFile = path.join(app, 'site/event.json');
const sh = (cmd, args, cwd = app) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });

// ids look like AKfycb...; clasp prints lines such as "- AKfycb... @3 - web app". @HEAD is the unversioned test deployment.
function parseDeploymentId(out) {
  for (const line of String(out).split('\n')) {
    if (/@HEAD\b/.test(line)) continue;
    const m = line.match(/\b(AKfy[\w-]{20,})(?=\s|$)/) || line.match(/-\s+([\w-]{20,})\s+@/);
    if (m) return m[1];
  }
  return null;
}
module.exports = { parseDeploymentId };
if (require.main !== module) return;
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

if (!fs.existsSync(path.join(os.homedir(), '.clasprc.json'))) {
  console.log('Sign in to Google first (opens a browser):\n\n  cd gas && npx -y @google/clasp login\n');
  console.log('Also switch the Apps Script API on: https://script.google.com/home/usersettings\nThen run `npm run google` again.');
  process.exit(2);
}

const claspFile = path.join(gas, '.clasp.json');
if (!fs.existsSync(claspFile)) {
  const manifest = path.join(gas, 'appsscript.json');
  const saved = fs.readFileSync(manifest, 'utf8');
  const title = read(eventFile).title || 'Event';
  try {
    sh('npx', ['-y', '@google/clasp', 'create-script', '--type', 'sheets', '--title', title, '--rootDir', '.'], gas);
  } finally {
    fs.writeFileSync(manifest, saved); // clasp may overwrite ours; it carries the web app settings
  }
}
const clasp = read(claspFile);

sh('npm', ['run', 'push']);
const parent = [].concat(clasp.parentId || [])[0];
if (parent) console.log(`\nYour Sheet: https://docs.google.com/spreadsheets/d/${parent}`);
console.log('In the Sheet: reload, then Invite app > Set up / repair tabs, and approve access.');
console.log('Google will say "Google hasn\'t verified this app". That is expected: the script is yours. Click Advanced, then "Go to <your event> (unsafe)", then Allow.\n');

const ev = read(eventFile);
if (!/\/macros\/s\/[\w-]+\/exec/.test(ev.api_url || '')) {
  const claspOut = (...a) => execFileSync('npx', ['-y', '@google/clasp', ...a], { cwd: gas, encoding: 'utf8' });
  // Reuse a deployment from an interrupted earlier run instead of creating a second one.
  const listing = claspOut('list-deployments');
  let id = parseDeploymentId(listing);
  if (!id) {
    const out = claspOut('create-deployment', '--description', 'web app');
    console.log(out);
    id = parseDeploymentId(out);
    if (!id) {
      console.log(`Could not read the deployment ID. clasp said:\n${listing}\n${out}\nPaste the ID (the AKfy... part) into site/event.json as\n  "api_url": "https://script.google.com/macros/s/<ID>/exec"\nthen run \`npm run deploy\`.`);
      process.exit(1);
    }
  }
  ev.api_url = `https://script.google.com/macros/s/${id}/exec`;
  fs.writeFileSync(eventFile, JSON.stringify(ev, null, 2) + '\n');
  console.log(`api_url saved: ${ev.api_url}`);
}
sh('npm', ['run', 'deploy']);
console.log(`\nYour invite site is live: ${read(eventFile).api_url}`);
console.log('Guest links get ?t=<token> added automatically by the Sheet\'s invite buttons.');
