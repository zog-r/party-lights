// Create a new event app from template/: `node scripts/new-event.js <dest> [--event my-event.json]`.
// Copies the template, drops in your event.json (validated), and stamps titles/og tags. Never overwrites.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Entries that don't make a folder "used": the event's own state and the tools around it.
const IGNORED = ['.party-lights', '.git', '.claude', '.DS_Store'];
module.exports = { IGNORED };
if (require.main !== module) return;

const args = process.argv.slice(2);
const evIdx = args.indexOf('--event');
const eventFile = evIdx >= 0 ? args[evIdx + 1] : null;
const dest = args.find((a, i) => !a.startsWith('--') && (evIdx < 0 || i !== evIdx + 1));
if (!dest) {
  console.error('usage: node scripts/new-event.js <dest> [--event event.json]');
  process.exit(2);
}
const out = path.resolve(dest);
if (fs.existsSync(out) && fs.readdirSync(out).some((n) => !IGNORED.includes(n))) {
  console.error(`${out} exists and isn't empty; pick a new folder.`);
  process.exit(2);
}

// Drop what this event doesn't use: pages of modules it turns off (no `features` list = all on), then any asset that no
// remaining page, stylesheet, script or event.json mentions. event.resolved.json is regenerated from event.json, so it doesn't count.
function prune(app) {
  const site = path.join(app, 'site');
  const { pagesFor } = require(path.join(app, 'scripts/page-hooks.js'));
  const ev = JSON.parse(fs.readFileSync(path.join(site, 'event.json'), 'utf8'));
  const keep = pagesFor(ev, site);
  for (const f of fs.readdirSync(site)) {
    if (f.endsWith('.html') && !['admin.html', 'sms.html'].includes(f) && !keep.includes(f)) fs.rmSync(path.join(site, f));
  }
  const text = fs.readdirSync(site).filter((f) => /\.(html|css|js|json)$/.test(f) && f !== 'event.resolved.json')
    .map((f) => fs.readFileSync(path.join(site, f), 'utf8')).join('\n');
  const used = new Set([...text.matchAll(/assets\/([\w.-]+)/g)].map((m) => m[1]));
  const assets = path.join(site, 'assets');
  for (const f of fs.readdirSync(assets)) if (!used.has(f)) fs.rmSync(path.join(assets, f));
}

fs.cpSync(path.join(__dirname, '..', 'template'), out, { recursive: true });
fs.writeFileSync(path.join(out, 'README.md'), '# My event\n\nMade with Party Lights. Local dev: `npm run dev` + `npm run serve`, then open http://localhost:5173/?t=test1\n');
if (eventFile) {
  const ev = JSON.parse(fs.readFileSync(eventFile, 'utf8'));
  ev.$schema = '../event.schema.json';
  fs.writeFileSync(path.join(out, 'site/event.json'), JSON.stringify(ev, null, 2) + '\n');
}
prune(out);
try {
  execFileSync('node', ['scripts/validate-event.js'], { cwd: out, stdio: 'inherit' });
} catch {
  console.error(`\nCreated ${out}, but fix site/event.json there, then run \`npm test\`.`);
  process.exit(1);
}
execFileSync('node', ['scripts/gen-event.js'], { cwd: out, stdio: 'inherit' });
console.log(`\nCreated ${out}\nNext: cd ${dest} && npm test && npm run dev  (then npm run serve in a second terminal)`);
