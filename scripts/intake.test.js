const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { validate } = require('../template/scripts/validate-event.js');

const intake = path.join(__dirname, 'intake.js');
const reg = require('../template/fields.json');
const example = require('../template/site/event.json');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'party-lights-intake-'));
const run = (...a) => execFileSync('node', [intake, ...a], { encoding: 'utf8', stdio: 'pipe' });
const questions = (file, ...more) => JSON.parse(run('questions', '--event', file, ...more));

function start(type, ...more) {
  const file = path.join(tmp(), 'event.json');
  run('start', '--type', type, '--out', file, ...more);
  return { file, ev: JSON.parse(fs.readFileSync(file, 'utf8')) };
}

// What the host's answers to the required questions add.
const basics = (type) => ({
  title: 'Test Gathering', intro: 'A small gathering. Come hungry.', area: 'Test Town', timezone: 'America/Denver',
  main: type === 'nye'
    ? { start: '2026-12-31T21:00', end: '2027-01-01T01:00', label: 'Countdown' }
    : { start: '2026-12-19T17:00', end: '2026-12-19T22:00', label: 'Dinner' },
  policies: { pets: false, kids: true },
});

function build(ev) {
  const file = path.join(tmp(), 'event.json');
  fs.writeFileSync(file, JSON.stringify(ev));
  const dir = path.join(tmp(), 'app');
  execFileSync('node', [path.join(__dirname, 'new-event.js'), dir, '--event', file], { stdio: 'pipe' });
  // The app's own full suite. NODE_TEST_CONTEXT must go: inherited from this test run, it makes a nested
  // `node --test` report nothing and exit 0, so a broken app would pass.
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  try {
    execFileSync('npm', ['test'], { cwd: dir, env, stdio: 'pipe', encoding: 'utf8' });
  } catch (e) {
    assert.fail(`the built app's npm test failed:\n${e.stdout}${e.stderr}`);
  }
  return dir;
}

for (const type of reg.event_types) {
  test(`${type.id}: starter event validates once the basics are filled, and builds a working app`, () => {
    const { file, ev } = start(type.id);
    assert.equal(ev.event_type, type.id);
    assert.deepEqual(ev.features, type.on);
    assert.ok(validate(ev).length > 0, 'the bare starter still needs the host\'s answers');
    const q = questions(file);
    assert.deepEqual(q.missing.filter((m) => m.required).map((m) => m.key).sort(),
      ['main.end', 'main.label', 'main.start', 'policies.kids', 'policies.pets', 'area', 'intro', 'title'].sort());
    const full = { ...ev, ...basics(type.id) };
    assert.deepEqual(validate(full), []);
    fs.writeFileSync(file, JSON.stringify(full));
    execFileSync('node', [path.join(__dirname, '../template/scripts/validate-event.js'), file], { stdio: 'pipe' }); // the real CLI, outside any app
    const dir = build(full);
    const built = JSON.parse(fs.readFileSync(path.join(dir, 'site/event.resolved.json'), 'utf8'));
    assert.ok(built.when_text && built.brand && built.tagline, 'derived fields were filled');
  });
}

test('start seeds the menu from the holiday and the activities when that module is on', () => {
  const { ev } = start('christmas', '--with', 'activities');
  const xmas = reg.event_types.find((t) => t.id === 'christmas');
  assert.deepEqual(ev.food_slots[0].suggestions, xmas.menu_ideas);
  assert.deepEqual(ev.activity_seeds.map((a) => a.title), xmas.activity_ideas);
  assert.equal(start('nye').ev.food_slots, undefined, 'nye has no menu by default');
});

test('start refuses an unknown type or module and never overwrites', () => {
  assert.throws(() => run('start', '--type', 'arbor_day'), /must be one of/);
  assert.throws(() => run('start', '--type', 'nye', '--with', 'karaoke', '--out', path.join(tmp(), 'x.json')), /unknown module/);
  const { file } = start('nye');
  assert.throws(() => run('start', '--type', 'nye', '--out', file), /already exists/);
});

test('questions skips what is filled, derived, ask:false, or off, and lists undecided modules', () => {
  const { file, ev } = start('thanksgiving');
  const q = questions(file);
  const keys = q.missing.map((m) => m.key);
  for (const derived of ['brand', 'tagline', 'when_text', 'reply.title', 'house.kicker', 'stay.nights']) assert.ok(!keys.includes(derived), derived);
  assert.ok(!keys.includes('images.hero'), 'filled by the starter');
  assert.ok(!keys.some((k) => k.startsWith('schedule') || k.startsWith('rooms')), 'off modules are not asked');
  assert.deepEqual(q.maybe_modules.map((m) => m.id), reg.event_types.find((t) => t.id === 'thanksgiving').maybe);
  assert.ok(q.maybe_modules.every((m) => m.label && m.ask_if));
  assert.deepEqual(q.maybe_modules.find((m) => m.id === 'rooms').needs, ['stay']);
  assert.deepEqual(q.ask_extra, reg.event_types.find((t) => t.id === 'thanksgiving').ask_extra);
  assert.deepEqual(q.agent_fill.map((a) => a.key), ['timezone']);

  fs.writeFileSync(file, JSON.stringify({ ...ev, ...basics('thanksgiving'), features: [...ev.features, 'stay'] }));
  const after = questions(file, '--skip', 'vibe,rooms');
  assert.deepEqual(after.missing.filter((m) => m.required).map((m) => m.key).sort(),
    ['stay.earliest_arrival', 'stay.latest_departure'], 'stay was turned on, so its dates are now asked');
  assert.ok(after.missing.some((m) => m.key === 'calendar.span'), 'asked only because stay is on');
  assert.ok(!after.maybe_modules.some((m) => ['stay', 'vibe', 'rooms'].includes(m.id)));
  assert.equal(after.agent_fill.length, 0, 'timezone is filled now');
});

test('a thanksgiving with every optional module on validates and builds', () => {
  const maybe = reg.event_types.find((t) => t.id === 'thanksgiving').maybe;
  const { ev } = start('thanksgiving', '--with', maybe.join(','));
  const { schedule, house, stay, trips_intro, trip_seeds } = example;
  const full = { ...ev, ...basics('thanksgiving'), schedule, house: { ...house, kicker: undefined }, stay, trips_intro, trip_seeds, rooms: { list: example.rooms.list },
    vibe: { theme: 'Cozy', dress_code: 'Sweaters' }, gift_exchange: { kind: 'white_elephant', limit: '$20' } };
  assert.deepEqual(validate(full), []);
  const built = JSON.parse(fs.readFileSync(path.join(build(full), 'site/event.resolved.json'), 'utf8'));
  assert.equal(built.stay_days.length, 3);
  assert.equal(built.rooms.total, 5);
  assert.equal(built.rooms.host_reserved, 1);
  assert.ok(built.activities_intro);
  assert.equal(built.house.kicker, 'Test Town');
});
