const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { validate } = require('./validate-event.js');

const ev = require('../site/event.json'); // the host's own event
// Frozen copy of the example event: every test below that assumes example data uses this, not the host's.
const fixture = require('./example-event.fixture.json');
const clone = () => structuredClone(fixture);

test('site/event.json is valid and its images exist', () => {
  assert.deepEqual(validate(ev, { assetsDir: path.join(__dirname, '..', 'site/assets') }), []);
});

test('catches shape errors', () => {
  const bad = clone();
  delete bad.title;
  bad.timezone = 'nowhere';
  bad.food_slots[0].id = 'Has Spaces';
  const errs = validate(bad).join('\n');
  assert.match(errs, /event.title: required/);
  assert.match(errs, /event.timezone/);
  assert.match(errs, /food_slots\[0\].id/);
});

test('catches cross-field errors', () => {
  const bad = clone();
  bad.title_em = 'not the ending';
  bad.food_slots[1].id = bad.food_slots[0].id;
  bad.schedule = bad.schedule.filter((s) => s.date !== bad.main.start.slice(0, 10));
  const errs = validate(bad).join('\n');
  assert.match(errs, /title_em/);
  assert.match(errs, /duplicate id/);
  assert.match(errs, /needs a row for the main day/);
});

test('a fresh event with no api_url yet is still valid', () => {
  const e = clone();
  e.api_url = '';
  assert.deepEqual(validate(e), []);
});

const { fillDerived } = require('./gen-event.js');

test('derived fields are computed when left out, and never overwrite what the host set', () => {
  const filled = fillDerived(structuredClone(fixture));
  assert.equal(filled.when_text, 'Sat, Dec 19 · 5 PM');
  assert.equal(filled.stay_text, 'Stay Fri–Sun, optional');
  assert.deepEqual(filled.stay_days.map((d) => d.id), ['fri', 'sat', 'sun']);
  assert.deepEqual([filled.stay.nights, filled.rooms.total, filled.rooms.host_reserved, filled.house.kicker], [2, 5, 1, fixture.area]);
  assert.equal(fillDerived({ ...structuredClone(fixture), when_text: 'Whenever', brand: 'Mine' }).when_text, 'Whenever');
});

test('gen-event keeps derived values out of event.json and re-derives them when the host edits dates', async () => {
  const os = require('node:os');
  const fs = require('node:fs');
  const { execFileSync } = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-'));
  fs.cpSync(path.join(__dirname, '..'), dir, { recursive: true, filter: (f) => !f.includes('node_modules') });
  fs.writeFileSync(path.join(dir, 'site/event.json'), JSON.stringify(fixture));
  const gen = () => execFileSync('node', ['scripts/gen-event.js'], { cwd: dir });
  const file = path.join(dir, 'site/event.json');
  const resolved = () => JSON.parse(fs.readFileSync(path.join(dir, 'site/event.resolved.json'), 'utf8'));
  gen();
  assert.equal(resolved().when_text, 'Sat, Dec 19 · 5 PM');
  const e = JSON.parse(fs.readFileSync(file, 'utf8'));
  e.main.start = '2026-12-19T18:30';
  fs.writeFileSync(file, JSON.stringify(e));
  gen();
  assert.equal(resolved().when_text, 'Sat, Dec 19 · 6:30 PM');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).when_text, undefined, 'gen does not write derived values back');
  const stamp = () => ['gas/event.gen.js', 'site/event.resolved.json', 'site/index.html'].map((f) => fs.statSync(path.join(dir, f)).mtimeMs);
  const before = stamp();
  await new Promise((r) => setTimeout(r, 20));
  gen();
  assert.deepEqual(stamp(), before, 'an unchanged gen run touches no files');
});

test('a New Year\'s Eve party can end after midnight', () => {
  const e = clone();
  Object.assign(e.main, { start: '2026-12-31T21:00', end: '2027-01-01T01:00' });
  e.stay = { earliest_arrival: '2026-12-31', latest_departure: '2027-01-01' };
  e.schedule = [{ date: '2026-12-31', title: 'Countdown', text: 'Midnight' }];
  e.stay_days = [{ id: 'thu', label: 'Thu 12/31' }, { id: 'fri', label: 'Fri 1/1' }];
  assert.deepEqual(validate(e), []);
  e.main.end = '2026-12-31T20:00';
  assert.match(validate(e).join(), /main.end/);
});

test('a module\'s fields are required only while it is in features', () => {
  const e = clone();
  e.features = [...new Set([...(e.features || []), 'menu'])];
  delete e.food_slots;
  assert.match(validate(e).join('\n'), /food_slots\[\].meal: required \(Potluck menu is on\)/);
  e.features = e.features.filter((f) => f !== 'menu');
  assert.deepEqual(validate(e), []);
});

test('always-on fields stay required even with no features', () => {
  const e = { ...clone(), features: [] };
  delete e.main.label;
  assert.match(validate(e).join('\n'), /main.label: required/);
});

test('rooms needs stay, and unknown features are named', () => {
  const e = clone();
  e.features = e.features.filter((f) => f !== 'stay');
  assert.match(validate(e).join('\n'), /"rooms" needs "stay"/);
  assert.match(validate({ ...clone(), features: ['karaoke'] }).join('\n'), /unknown piece "karaoke"/);
});

test('without features, modules count as on when their data is present', () => {
  const e = clone();
  delete e.features; delete e.event_type;
  assert.deepEqual(validate(e), []);
  e.food_slots = [];
  assert.deepEqual(validate(e), []); // empty list = menu data absent = menu off
  delete e.stay.latest_departure; delete e.stay_days;
  assert.match(validate(e).join('\n'), /stay.latest_departure/);
});
