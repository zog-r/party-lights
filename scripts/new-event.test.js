const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const script = path.join(__dirname, 'new-event.js');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'party-lights-'));

test('creates a working app from the template with a custom event', () => {
  const dir = path.join(tmp(), 'party');
  const ev = JSON.parse(fs.readFileSync(path.join(__dirname, '../template/site/event.json'), 'utf8'));
  ev.title = 'Spring Picnic in the Park';
  ev.title_em = 'in the Park';
  const evFile = path.join(tmp(), 'event.json');
  fs.writeFileSync(evFile, JSON.stringify(ev));
  execFileSync('node', [script, dir, '--event', evFile], { stdio: 'pipe' });
  assert.match(fs.readFileSync(path.join(dir, 'site/index.html'), 'utf8'), /<title>Spring Picnic in the Park<\/title>/);
  assert.match(fs.readFileSync(path.join(dir, 'gas/event.gen.js'), 'utf8'), /Spring Picnic/);
  execFileSync('node', ['--test', 'gas/api.test.js', 'scripts/event.test.js'], { cwd: dir, stdio: 'pipe' });
});

test('works with just a destination (example event)', () => {
  const dir = path.join(tmp(), 'plain');
  execFileSync('node', [script, dir], { stdio: 'pipe' });
  assert.match(fs.readFileSync(path.join(dir, 'site/index.html'), 'utf8'), /<title>Winter Supper at the Cabin<\/title>/);
});

test('refuses to overwrite a non-empty folder', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'keep.txt'), 'x');
  assert.throws(() => execFileSync('node', [script, dir], { stdio: 'pipe' }), /isn't empty/);
  assert.deepEqual(fs.readdirSync(dir), ['keep.txt']);
});

test('reports an invalid event.json', () => {
  const evFile = path.join(tmp(), 'event.json');
  fs.writeFileSync(evFile, JSON.stringify({ title: 'Only a title' }));
  assert.throws(() => execFileSync('node', [script, path.join(tmp(), 'x'), '--event', evFile], { stdio: 'pipe' }));
});

test('an app built from a menu-off event with a host-set when_text passes its own npm test', () => {
  const ev = JSON.parse(fs.readFileSync(path.join(__dirname, '../template/site/event.json'), 'utf8'));
  ev.features = ev.features.filter((f) => !['menu', 'dietary', 'guest_list'].includes(f));
  ev.when_text = 'Saturday evening';
  const evFile = path.join(tmp(), 'event.json');
  fs.writeFileSync(evFile, JSON.stringify(ev));
  const dir = path.join(tmp(), 'nomenu');
  execFileSync('node', [script, dir, '--event', evFile], { stdio: 'pipe' });
  execFileSync('npm', ['test'], { cwd: dir, stdio: 'pipe' });
});
