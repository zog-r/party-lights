const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { evaluate, designDecision } = require('./next.js');

function setup() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'gnb-'));
  const root = path.join(base, 'party-lights');
  const home = path.join(base, 'home');
  fs.mkdirSync(root);
  fs.mkdirSync(home);
  const state = { event: './event.json', app: '../party', marks: {} };
  const calls = { tests: 0 };
  const dep = { valid: true, testsOk: true, status: 200, page: { status: 200, body: '<html><title>Party</title></html>' } };
  const deps = {
    nodeMajor: () => 22,
    has: () => true,
    validate: () => ({ ok: dep.valid, output: 'bad' }),
    runTests: () => { calls.tests++; return dep.testsOk; },
    fetchStatus: async () => dep.status,
    fetchPage: async () => dep.page,
  };
  const run = () => evaluate({ root, home, state, deps });
  return { base, root, home, state, calls, dep, run, app: path.join(base, 'party') };
}
const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };

test('walks every phase in order', async () => {
  const t = setup();
  assert.equal((await t.run()).phase, 'describe'); // no event
  write(path.join(t.root, 'event.json'), JSON.stringify({ title: 'Party' }));
  let c = await t.run();
  assert.equal(c.phase, 'describe'); // valid but unmarked
  assert.equal(c.step, 1);
  t.state.marks.describe = true;
  c = await t.run();
  assert.equal(c.phase, 'build');
  assert.match(c.run[0], /npm run new -- \.\.\/party --event \.\/event\.json/);

  write(path.join(t.app, 'site/event.json'), JSON.stringify({ api_url: '', site_url: '' }));
  t.dep.testsOk = false;
  c = await t.run();
  assert.equal(c.phase, 'build');
  assert.match(c.why, /tests fail/);
  t.dep.testsOk = true;
  fs.utimesSync(path.join(t.app, 'site/event.json'), new Date(), new Date(Date.now() + 5000)); // bust the cache
  assert.equal((await t.run()).phase, 'design');
  assert.deepEqual((await t.run()).done, ['doctor', 'describe', 'build']);

  t.state.marks.design = 'skipped';
  assert.equal((await t.run()).phase, 'review');
  t.state.marks.review = '8';
  assert.equal((await t.run()).phase, 'approve');
  t.state.marks.approve = true;

  c = await t.run();
  assert.equal(c.phase, 'google');
  assert.match(c.host_run[0], /clasp login/);

  write(path.join(t.home, '.clasprc.json'), '{}');
  c = await t.run();
  assert.equal(c.phase, 'google');
  assert.match(c.run[0], /npm run google/);

  write(path.join(t.app, 'gas/.clasp.json'), JSON.stringify({ scriptId: 'SID', parentId: ['PID'] }));
  write(path.join(t.app, 'site/event.json'), JSON.stringify({ api_url: 'https://script.google.com/macros/s/AKfy-1/exec', site_url: '' }));
  c = await t.run();
  assert.equal(c.phase, 'google');
  assert.ok(c.links.some((l) => l.url === 'https://docs.google.com/spreadsheets/d/PID'));
  t.state.marks.sheet = true;

  // gas hosting (default): the exec URL must serve the event
  t.dep.page = { status: 200, body: '<title>Other</title>' };
  c = await t.run();
  assert.equal(c.phase, 'publish');
  assert.equal(c.status, 'todo');
  assert.ok(c.links.some((l) => l.url.endsWith('/exec')));
  t.dep.page = null;
  c = await t.run();
  assert.equal(c.status, 'unreachable');
  t.dep.page = { status: 200, body: '<html><title>Party &amp; Co</title></html>' };
  write(path.join(t.root, 'event.json'), JSON.stringify({ title: '' }));
  c = await t.run();
  assert.equal(c.phase, 'publish', 'an empty title must not match any 200 page');
  write(path.join(t.root, 'event.json'), JSON.stringify({ title: 'Party & Co' }));
  c = await t.run();
  assert.equal(c.phase, 'smoke');
  assert.ok(c.links.some((l) => l.url === 'https://script.google.com/macros/s/AKfy-1/exec'));
  assert.ok(c.ask.some((a) => /page=admin&k=/.test(a)));
  write(path.join(t.root, 'event.json'), JSON.stringify({ title: 'Party' }));
  t.dep.page = { status: 200, body: '<title>Party</title>' };

  // vercel hosting is opt-in
  t.state.marks.hosting = 'vercel';
  c = await t.run();
  assert.equal(c.phase, 'publish');
  assert.match(c.run[0], /npm run host/);

  write(path.join(t.app, 'site/event.json'), JSON.stringify({ api_url: 'https://script.google.com/macros/s/AKfy-1/exec', site_url: 'https://party.vercel.app' }));
  t.dep.status = null;
  c = await t.run();
  assert.equal(c.phase, 'publish');
  assert.equal(c.status, 'unreachable');
  t.dep.status = 200;

  assert.equal((await t.run()).phase, 'smoke');
  t.state.marks.smoke = true;
  assert.equal((await t.run()).phase, 'invite');
  t.state.marks.invite = true;
  c = await t.run();
  assert.equal(c.phase, 'done');
  assert.equal(c.done.length, 10);
  assert.ok(c.notes.length >= 3);
});

test('invalid event stays in describe even when marked', async () => {
  const t = setup();
  write(path.join(t.root, 'event.json'), '{}');
  t.state.marks.describe = true;
  t.dep.valid = false;
  const c = await t.run();
  assert.equal(c.phase, 'describe');
  assert.deepEqual(c.ask, ['bad']);
});

test('test result is cached until site/ or gas/ changes', async () => {
  const t = setup();
  write(path.join(t.root, 'event.json'), '{"title":"Party"}');
  write(path.join(t.app, 'site/event.json'), '{}');
  t.state.marks.describe = true;
  await t.run();
  await t.run();
  assert.equal(t.calls.tests, 1);
  fs.utimesSync(path.join(t.app, 'site/event.json'), new Date(), new Date(Date.now() + 9000));
  await t.run();
  assert.equal(t.calls.tests, 2);
});

test('doctor blocks on old node', async () => {
  const t = setup();
  const c = await evaluate({ root: t.root, home: t.home, state: t.state, deps: { nodeMajor: () => 18, has: () => false } });
  assert.equal(c.phase, 'doctor');
});

test('design is done by a manifest stop decision', async () => {
  assert.equal(designDecision({ decision: 'PASS' }), 'PASS');
  assert.equal(designDecision({ rounds: [{ decision: 'CONTINUE' }, { decision: 'STOP_PLATEAU' }] }), 'STOP_PLATEAU');
  assert.equal(designDecision({ decision: 'CONTINUE' }), null);
  const t = setup();
  write(path.join(t.root, 'event.json'), '{"title":"Party"}');
  write(path.join(t.app, 'site/event.json'), '{}');
  write(path.join(t.app, '.design-loop/manifest.json'), JSON.stringify({ decision: 'STOP_MAX' }));
  t.state.marks.describe = true;
  assert.equal((await t.run()).phase, 'review');
});
