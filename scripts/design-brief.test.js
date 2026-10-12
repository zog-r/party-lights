const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function brief(extraArgs) {
  const app = fs.mkdtempSync(path.join(os.tmpdir(), 'brief-'));
  fs.mkdirSync(path.join(app, 'site'));
  fs.writeFileSync(path.join(app, 'site/event.json'), JSON.stringify({ title: 'Friendsgiving', event_type: 'thanksgiving', vibe: { theme: 'Ugly sweaters' } }));
  execFileSync('node', [path.join(__dirname, 'design-brief.js'), '--app', app, ...extraArgs], { stdio: 'ignore' });
  return JSON.parse(fs.readFileSync(path.join(app, '.design-loop.brief.json'), 'utf8')).mood;
}

test('the host\'s own words lead the mood; the holiday default is only a fallback', () => {
  const mood = brief(['--look', 'Moody, plum and brass, like a jazz bar']);
  assert.ok(mood.startsWith('Moody, plum and brass'));
  assert.match(mood, /Party theme: Ugly sweaters/);
  assert.match(mood, /Holiday baseline/);
});

test('without --look the holiday default is the mood', () => {
  assert.match(brief([]), /^Party theme: Ugly sweaters\. /);
});

test('the brief lists every page the event turns on, each with its hook contract', () => {
  const app = fs.mkdtempSync(path.join(os.tmpdir(), 'brief-'));
  fs.mkdirSync(path.join(app, 'site'));
  fs.writeFileSync(path.join(app, 'site/event.json'), JSON.stringify({ title: 'Supper', event_type: 'thanksgiving', features: ['menu'] }));
  execFileSync('node', [path.join(__dirname, 'design-brief.js'), '--app', app], { stdio: 'ignore' });
  const b = JSON.parse(fs.readFileSync(path.join(app, '.design-loop.brief.json'), 'utf8'));
  assert.deepStrictEqual(b.pages.map((p) => p.file), ['details.html', 'index.html', 'menu.html', 'rsvp.html']);
  assert.ok(b.pages.find((p) => p.file === 'rsvp.html').hooks.ids.includes('form'));
  assert.match(b.constraints, /re-compose every page/);
  assert.match(b.constraints, /full nav/);
});

test('check-hooks fails on a lost hook or an unreplaced hero, passes once both are fine', () => {
  const app = fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-'));
  fs.cpSync(path.join(__dirname, '../template/site'), path.join(app, 'site'), { recursive: true });
  const run = () => execFileSync('node', [path.join(__dirname, 'check-hooks.js'), '--app', app], { stdio: 'pipe' });
  assert.throws(run, (e) => /starter placeholder/.test(String(e.stderr))); // the email hero is still the stock picture
  fs.writeFileSync(path.join(app, 'site/assets/hero.jpg'), 'a screenshot of the new hero');
  run();
  const f = path.join(app, 'site/menu.html');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('id="addDlg"', 'id="x"'));
  assert.throws(run, (e) => /menu\.html: id addDlg/.test(String(e.stderr)));
});

test('check-hooks judges against the snapshot, so hooks a plugin upgrade adds do not fail an older app', () => {
  const app = fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-'));
  fs.cpSync(path.join(__dirname, '../template/site'), path.join(app, 'site'), { recursive: true });
  fs.writeFileSync(path.join(app, 'site/assets/hero.jpg'), 'a screenshot of the new hero');
  const f = path.join(app, 'site/menu.html');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('id="addDlg"', 'id="x"'));
  const { check, snapshot } = require('../template/scripts/page-hooks.js');
  assert.match(check(app).join('\n'), /menu\.html: id addDlg/); // no snapshot: live template
  const snap = path.join(app, '.party-lights/hooks.json');
  fs.mkdirSync(path.dirname(snap), { recursive: true });
  const old = require('../template/scripts/page-hooks.js').contract(path.join(__dirname, '../template/site'));
  old['menu.html'].ids = old['menu.html'].ids.filter((i) => i !== 'addDlg');
  fs.writeFileSync(snap, JSON.stringify(old));
  assert.deepEqual(check(app), []);
  snapshot(app); // never overwrites
  assert.deepEqual(JSON.parse(fs.readFileSync(snap, 'utf8'))['menu.html'].ids, old['menu.html'].ids);
});
