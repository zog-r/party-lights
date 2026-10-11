// Create a new event app from template/: `node scripts/new-event.js <dest> [--event my-event.json]`.
// Copies the template, drops in your event.json (validated), and stamps titles/og tags. Never overwrites.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const args = process.argv.slice(2);
const evIdx = args.indexOf('--event');
const eventFile = evIdx >= 0 ? args[evIdx + 1] : null;
const dest = args.find((a, i) => !a.startsWith('--') && (evIdx < 0 || i !== evIdx + 1));
if (!dest) {
  console.error('usage: node scripts/new-event.js <dest> [--event event.json]');
  process.exit(2);
}
const out = path.resolve(dest);
if (fs.existsSync(out) && fs.readdirSync(out).length) {
  console.error(`${out} exists and isn't empty; pick a new folder.`);
  process.exit(2);
}

fs.cpSync(path.join(__dirname, '..', 'template'), out, { recursive: true });
fs.writeFileSync(path.join(out, 'README.md'), '# My event\n\nMade with Party Lights. Local dev: `npm run dev` + `npm run serve`, then open http://localhost:5173/?t=test1\n');
if (eventFile) {
  const ev = JSON.parse(fs.readFileSync(eventFile, 'utf8'));
  ev.$schema = '../event.schema.json';
  fs.writeFileSync(path.join(out, 'site/event.json'), JSON.stringify(ev, null, 2) + '\n');
}
try {
  execFileSync('node', ['scripts/validate-event.js'], { cwd: out, stdio: 'inherit' });
} catch {
  console.error(`\nCreated ${out}, but fix site/event.json there, then run \`npm test\`.`);
  process.exit(1);
}
execFileSync('node', ['scripts/gen-event.js'], { cwd: out, stdio: 'inherit' });
console.log(`\nCreated ${out}\nNext: cd ${dest} && npm test && npm run dev  (then npm run serve in a second terminal)`);
