// End-to-end over the real Apps Script code, with an in-memory Sheet (scripts/dev-api.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { makeContext, seed, call } = require('../scripts/dev-api.js');
// Frozen example event: these tests assume its food, trips, stay and rooms, not the host's.
const FIXTURE = require('../scripts/example-event.fixture.json');
const EV = require('../scripts/gen-event.js').fillDerived(structuredClone(FIXTURE));
// Calendar date `n` days before the main event.
const before = (n) => new Date(Date.parse(EV.main.start.slice(0, 10)) - n * 864e5).toISOString().slice(0, 10);

// The confirmation email links menu/trips only when those modules are on; force them on for link assertions.
function withModules(ctx) {
  vm.runInContext("EVENT.features = [...new Set([...(EVENT.features || []), 'menu', 'trips'])]", ctx);
  return ctx;
}

function fresh() {
  const ctx = makeContext(FIXTURE);
  seed(ctx);
  return ctx;
}

test('bad token is rejected', () => {
  assert.deepEqual(call(fresh(), { action: 'me', token: 'nope' }), { ok: false, error: 'bad_token' });
});

test('address only after RSVP yes', () => {
  const ctx = fresh();
  assert.equal(call(ctx, { action: 'me', token: 'test2' }).data.address, undefined);
  const r = call(ctx, { action: 'rsvp', token: 'test2', rsvp: { status: 'yes', adults: 1, sleep: 'request_room', room_reason: 'Early flight' } });
  assert.equal(r.ok, true);
  assert.match(r.data.address, /Example Lane/);
  const actions = JSON.parse(vm.runInContext("JSON.stringify(rows_('Log').map((l) => l.action))", ctx));
  assert.deepEqual(actions.slice(-3), ['rsvp', 'guest_confirmed', 'room_request']);
});

test('cancel is logged when yes becomes no', () => {
  const ctx = fresh();
  call(ctx, { action: 'rsvp', token: 'test1', rsvp: { status: 'no' } });
  assert.equal(vm.runInContext("rows_('Log').at(-1).action", ctx), 'cancel');
});

test('food: add, see on board, only remove your own', { skip: !EV.food_slots?.length && 'menu is off' }, () => {
  const ctx = fresh();
  assert.equal(call(ctx, { action: 'addFood', token: 'test2', slot: 'drinks', item: 'Wine' }).ok, false, 'invited cannot add');
  const add = call(ctx, { action: 'addFood', token: 'test1', slot: EV.food_slots.at(-2).id, item: 'Pie' });
  assert.equal(add.ok, true);
  const b = call(ctx, { action: 'board', token: 'test1' }).data;
  assert.ok(b.menu.some((m) => m.item === 'Pie' && m.by === 'Alex' && m.mine));
  assert.equal(call(ctx, { action: 'removeFood', token: 'test3', id: add.data.id }).ok, false);
  assert.equal(call(ctx, { action: 'removeFood', token: 'test1', id: add.data.id }).ok, true);
});

test('board hides contact info and follows settings', () => {
  const ctx = fresh();
  const b = call(ctx, { action: 'board', token: 'test2' }).data;
  assert.deepEqual(b.guests, [{ name: 'Alex Tester', status: 'yes', party: 3 }]);
  assert.equal(b.count, 3);
  assert.ok(!JSON.stringify(b).includes('example.com'));
});

test('trips: propose, host, join', { skip: !EV.trip_seeds?.length && 'day trips are off' }, () => {
  const ctx = fresh();
  const seeds = call(ctx, { action: 'board', token: 'test1' }).data.trips;
  assert.equal(seeds.length, EV.trip_seeds.length);
  assert.equal(call(ctx, { action: 'trip', token: 'test1', id: seeds[0].id, op: 'host' }).ok, true);
  assert.equal(call(ctx, { action: 'trip', token: 'test3', id: seeds[0].id, op: 'host' }).ok, false);
  call(ctx, { action: 'trip', token: 'test3', id: seeds[0].id, op: 'join' });
  const t = call(ctx, { action: 'board', token: 'test3' }).data.trips[0];
  assert.equal(t.host, 'Alex');
  assert.deepEqual(t.joiners, ['Alex', 'Casey']);
  assert.equal(t.joined, true);
});

test('admin requires key', () => {
  const ctx = fresh();
  assert.equal(call(ctx, { action: 'admin', key: 'wrong' }).ok, false);
  assert.equal(call(ctx, { action: 'admin', key: 'dev' }).data.guests.length, 3);
});

test('daily run at T-14 emails confirm gate and sends host a text digest', () => {
  const ctx = fresh();
  ctx.outbox.length = 0;
  const due = JSON.parse(JSON.stringify(vm.runInContext(`dailyRun('${before(14)}')`, ctx)));
  assert.deepEqual(due.map((d) => d.token + ':' + d.kind + ':' + d.channel), ['test1:confirm:email', 'test3:remind:text']);
  const subjects = ctx.outbox.map((a) => a[0].subject);
  assert.ok(subjects.some((s) => /Still coming/.test(s)));
  const digest = ctx.outbox.find((a) => /Text 1 guest/.test(a[0].subject))[0];
  assert.match(digest.htmlBody, /href="https?:\/\/[^"]*\/sms\.html\?to=5550003333&(amp;)?body=/);
  assert.ok(!digest.htmlBody.includes('sms:'));
});

test('confirm link records confirmation', () => {
  const ctx = fresh();
  assert.equal(call(ctx, { action: 'confirm', token: 'test1', days: 14 }).ok, true);
  assert.ok(call(ctx, { action: 'me', token: 'test1' }).data.guest.confirmed_14);
});

test('notifications are queued, then flushed once', () => {
  const ctx = fresh();
  ctx.outbox.length = 0;
  call(ctx, { action: 'rsvp', token: 'test2', rsvp: { status: 'yes', adults: 1 } });
  assert.equal(ctx.outbox.length, 0, 'request path sends nothing');
  assert.equal(vm.runInContext('flushNotifications()', ctx), 2);
  assert.match(ctx.outbox[0][1], /rsvp/);
  assert.equal(vm.runInContext("rows_('Log').at(-2).notified", ctx), 'email+push:200');
  assert.equal(vm.runInContext('flushNotifications()', ctx), 0);
});

test('first RSVP yes queues a guest confirmation email once', () => {
  const ctx = withModules(fresh());
  ctx.outbox.length = 0;
  const rsvp = { status: 'yes', adults: 1 };
  call(ctx, { action: 'rsvp', token: 'test2', rsvp });
  call(ctx, { action: 'rsvp', token: 'test2', rsvp: { ...rsvp, adults: 2 } });
  vm.runInContext('flushNotifications()', ctx);
  const mails = ctx.outbox.map((a) => a[0]).filter((m) => /^You're in!/.test(m.subject || ''));
  assert.equal(mails.length, 1);
  for (const page of ['details', 'menu', 'trips']) assert.match(mails[0].htmlBody, new RegExp(page + '\\.html\\?t=test2'));
  assert.match(mails[0].htmlBody, /localhost:5173\/\?t=test2/);
});

const settingRow = (ctx, k) => JSON.parse(vm.runInContext(`JSON.stringify(rows_('Settings').find((x) => x.key === '${k}') || null)`, ctx));
const setSetting = (ctx, k, v) => vm.runInContext(`updateRow_('Settings', rows_('Settings').find((x) => x.key === '${k}')._row, { value: ${JSON.stringify(v)} })`, ctx);
const confirmedMail = (ctx, token) => {
  ctx.outbox.length = 0;
  call(ctx, { action: 'rsvp', token, rsvp: { status: 'yes', adults: 1 } });
  vm.runInContext('flushNotifications()', ctx);
  return ctx.outbox.map((a) => a[0]).find((m) => m.to === 'blair@example.com');
};

test('setup writes labels and groups, keeps reading by key, and migrates an old key|value|note sheet', () => {
  const ctx = fresh();
  assert.ok(settingRow(ctx, 'notify_room_request_push').label.includes('room'));
  const old = makeContext();
  vm.runInContext(`
    SpreadsheetApp.getActive().insertSheet('Settings');
    sheet_('Settings').appendRow(['key', 'value', 'note']);
    sheet_('Settings').appendRow(['site_url', 'https://kept.test', 'x']);
    sheet_('Settings').appendRow(['address', '1 Old Rd', '']);
    sheet_('Settings').appendRow(['mystery', 'v', 'n']);
    setup();`, old);
  const s = JSON.parse(vm.runInContext('JSON.stringify(settings_())', old));
  assert.equal(s.site_url, 'https://kept.test');
  assert.equal(s.address, '1 Old Rd');
  assert.equal(s.mystery, 'v');
  assert.ok(s.admin_key);
  assert.equal(vm.runInContext("rows_('Settings').find((x) => x.key === 'address').label", old), 'Street address');
});

test('guest confirmation keeps the built-in copy without overrides', () => {
  const m = confirmedMail(fresh(), 'test2');
  assert.equal(m.subject, `You're in! ${EV.title}`);
  assert.match(m.htmlBody, /I'm excited to host you!/);
});

test('guest confirmation links only the modules that are on', () => {
  const ctx = fresh();
  vm.runInContext("EVENT.features = EVENT.features.filter((f) => f !== 'menu' && f !== 'trips')", ctx);
  const html = confirmedMail(ctx, 'test2').htmlBody;
  assert.doesNotMatch(html, /menu\.html|trips\.html/);
  assert.match(html, /localhost:5173\/\?t=test2/);
});

test('guest emails: toggle off, sender name and reply-to', () => {
  const ctx = fresh();
  setSetting(ctx, 'guest_from_name', 'The Hosts');
  setSetting(ctx, 'guest_reply_to', 'reply@example.com');
  const m = confirmedMail(ctx, 'test2');
  assert.equal(m.name, 'The Hosts');
  assert.equal(m.replyTo, 'reply@example.com');

  const off = fresh();
  setSetting(off, 'guest_confirmed_email', false);
  assert.equal(confirmedMail(off, 'test2'), undefined);
  assert.equal(vm.runInContext("rows_('Log').filter((l) => l.action === 'guest_confirmed').at(-1).notified", off), 'off');
});

test('guest confirmation copy from Settings fills placeholders and escapes values', () => {
  const ctx = withModules(fresh());
  vm.runInContext("updateRow_('Guests', rows_('Guests').find((g) => g.token === 'test2')._row, { name: '<b>Blair</b> Sample' })", ctx);
  setSetting(ctx, 'guest_confirmed_subject', 'See you, {first_name}!');
  setSetting(ctx, 'guest_confirmed_body', 'Hi {first_name}, {title} is {when}.\n\nPick food at {menu_link}.');
  const m = confirmedMail(ctx, 'test2');
  assert.equal(m.subject, 'See you, <b>Blair</b>!');
  assert.match(m.htmlBody, /Hi &lt;b&gt;Blair&lt;\/b&gt;, /);
  assert.ok(!m.htmlBody.includes('<b>Blair'));
  assert.match(m.htmlBody, /href="[^"]*menu\.html\?t=test2"[^>]*>the menu<\/a>/);
  assert.ok(!m.htmlBody.includes("I'm excited"));
  assert.match(m.htmlBody, /Add to calendar/);
});

test('invite and reminder emails honor toggles and copy', () => {
  const ctx = fresh();
  setSetting(ctx, 'guest_confirm_email', false);
  ctx.outbox.length = 0;
  vm.runInContext(`dailyRun('${before(14)}')`, ctx);
  assert.ok(!ctx.outbox.some((a) => /Still coming/.test(a[0].subject)), 'confirm email off');

  const on = fresh();
  setSetting(on, 'guest_confirm_subject', '{days} days! {first_name}?');
  setSetting(on, 'guest_confirm_body', 'Still in, {first_name}? {invite_link}');
  on.outbox.length = 0;
  vm.runInContext(`dailyRun('${before(14)}')`, on);
  const mail = on.outbox.map((a) => a[0]).find((m) => m.to === 'alex@example.com');
  assert.equal(mail.subject, '14 days! Alex?');
  assert.match(mail.htmlBody, /Still in, Alex\? <a href="[^"]*confirm=14/);
});

const guestRow = (ctx, token) => JSON.parse(vm.runInContext(`JSON.stringify(rows_('Guests').find((g) => g.token === '${token}'))`, ctx));
const addGuest = (ctx, g) => vm.runInContext(`appendRow_('Guests', ${JSON.stringify(g)})`, ctx);
const inviteLogs = (ctx) => JSON.parse(vm.runInContext("JSON.stringify(rows_('Log').filter((l) => l.action === 'invite_sent'))", ctx));

test('generate tokens writes tokens only and leaves status blank', () => {
  const ctx = fresh();
  addGuest(ctx, { name: 'New Person', email: 'new@example.com' });
  vm.runInContext('generateTokens()', ctx);
  const g = JSON.parse(vm.runInContext("JSON.stringify(rows_('Guests').find((r) => r.name === 'New Person'))", ctx));
  assert.ok(g.token);
  assert.equal(g.status, '');
});

test('text invites: one host email, sms.html links, any row with a phone, status set once', () => {
  const ctx = fresh();
  addGuest(ctx, { token: 'p1', name: 'Phone Only', phone: '(555) 000-4444' });
  addGuest(ctx, { token: 'p2', name: 'Both', email: 'both@example.com', phone: '5550005555' });
  addGuest(ctx, { token: 'p3', name: 'Email Only', email: 'eo@example.com' });
  ctx.outbox.length = 0;
  vm.runInContext('textInvitesToSelection()', ctx);
  assert.equal(ctx.outbox.length, 1);
  const m = ctx.outbox[0][0];
  assert.equal(m.to, 'host@example.com');
  assert.match(m.subject, /^Text 5 invite/);
  assert.match(m.htmlBody, /sms\.html\?to=5550004444&amp;body=/);
  assert.match(m.htmlBody, />Both</);
  assert.ok(!m.htmlBody.includes('Email Only') && !m.htmlBody.includes('sms:'));
  assert.ok(m.htmlBody.includes(encodeURIComponent('http://localhost:5173/?t=p1')));
  assert.equal(inviteLogs(ctx).length, 5);
  assert.equal(guestRow(ctx, 'p1').status, 'invited');
  assert.equal(guestRow(ctx, 'test1').status, 'yes', 'existing status never overwritten');
  assert.equal(guestRow(ctx, 'test3').status, 'maybe');
  assert.equal(guestRow(ctx, 'p3').status, '');
});

test('text invites respect the selection and need host_email', () => {
  const ctx = fresh();
  ctx.selection = { row: 2, rows: 1 };
  ctx.outbox.length = 0;
  vm.runInContext('textInvitesToSelection()', ctx);
  assert.match(ctx.outbox[0][0].subject, /^Text 1 invite/);
  setSetting(ctx, 'host_email', '');
  assert.throws(() => vm.runInContext('textInvitesToSelection()', ctx), /host_email/);
});

test('email invites go to any row with an email and set blank status to invited', () => {
  const ctx = fresh();
  addGuest(ctx, { token: 'e1', name: 'Mail Both', email: 'mb@example.com', phone: '5550006666' });
  ctx.outbox.length = 0;
  vm.runInContext('emailInvitesToSelection()', ctx);
  const to = ctx.outbox.map((a) => a[0].to);
  assert.ok(to.includes('mb@example.com') && to.includes('alex@example.com'));
  assert.ok(!to.includes(undefined));
  assert.equal(guestRow(ctx, 'e1').status, 'invited');
  assert.equal(guestRow(ctx, 'test1').status, 'yes');
});

// ---- Apps Script hosting: pages are served by doGet, not a separate site ----
const EXEC = 'https://script.google.com/macros/s/TEST/exec';
const gasMode = (ctx) => { setSetting(ctx, 'site_url', ''); return ctx; };

test('doGet: ping stays JSON; pages are whitelisted, unknown falls back to index', () => {
  const ctx = fresh();
  assert.deepEqual(JSON.parse(ctx.doGet({ parameter: { ping: '1' } }).body), { ok: true, title: EV.title });
  const out = ctx.doGet({ parameter: { page: 'rsvp', t: 'test1' } });
  assert.equal(out.title, EV.title);
  assert.match(out.meta.viewport, /width=device-width/);
  assert.match(out.html, /<base target="_top">/);
  assert.ok(out.html.includes(`"base":"${EXEC}"`));
  assert.ok(out.html.includes('"page":"rsvp"') && out.html.includes('"t":"test1"'));
  assert.ok(out.html.indexOf('window.GAS') < out.html.indexOf('window.EVENT_DATA'), 'GAS is set before app code runs');
  const fallback = ctx.doGet({ parameter: { page: '../../etc/passwd' } }).html;
  assert.equal(fallback.replace(/"page":"[^"]*"/, ''), ctx.doGet({ parameter: { page: 'index' } }).html.replace(/"page":"[^"]*"/, ''));
  assert.equal(ctx.doGet().title, EV.title, 'no parameters at all serves the invite');
});

test('doGet: a param cannot break out of the injected script', () => {
  const html = fresh().doGet({ parameter: { page: 'index', x: '</script><script>alert(1)</script>' } }).html;
  assert.ok(!html.includes('</script><script>alert(1)'));
  assert.ok(html.includes('\\u003c/script>'));
});

test('api() answers like doPost', () => {
  const ctx = fresh();
  for (const body of [{ action: 'me', token: 'test1' }, { action: 'me', token: 'nope' }, { action: 'nope', token: 'test1' }]) {
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.api(JSON.stringify(body)))), call(ctx, body));
  }
  assert.equal(ctx.api('not json').ok, false);
});

test('pageUrl_: Settings site_url wins, else the web app URL', () => {
  const ctx = fresh();
  assert.equal(vm.runInContext("pageUrl_({ site_url: 'https://x.test' }, 'rsvp', 't=a')", ctx), 'https://x.test/rsvp.html?t=a');
  assert.equal(vm.runInContext("pageUrl_({ site_url: 'https://x.test' }, 'index', 't=a')", ctx), 'https://x.test/?t=a');
  assert.equal(vm.runInContext("pageUrl_({}, 'rsvp', 't=a')", ctx), `${EXEC}?page=rsvp&t=a`);
  // A Sheet-menu run gets a non-/exec getUrl(); the saved api_url must win.
  ctx.ScriptApp.getService = () => ({ getUrl: () => 'https://script.google.com/macros/s/WRONG/dev' });
  vm.runInContext("EVENT.api_url = 'https://script.google.com/macros/s/LIVE/exec'", ctx);
  assert.equal(vm.runInContext("pageUrl_({}, 'rsvp', 't=a')", ctx), 'https://script.google.com/macros/s/LIVE/exec?page=rsvp&t=a');
});

test('GAS mode: invites need no site_url and link to the web app', () => {
  const ctx = gasMode(fresh());
  ctx.outbox.length = 0;
  vm.runInContext('emailInvitesToSelection()', ctx);
  assert.ok(ctx.outbox.some((a) => a[0].htmlBody.includes(`${EXEC}?page=index&amp;t=test2`)));
  ctx.outbox.length = 0;
  vm.runInContext('textInvitesToSelection()', ctx);
  assert.match(ctx.outbox[0][0].htmlBody, new RegExp(EXEC.replace(/[/.]/g, '\\$&') + '\\?page=sms&amp;to='));
});

test('GAS mode: confirmation email carries the hero as an inline image', () => {
  const ctx = withModules(gasMode(fresh()));
  const m = confirmedMail(ctx, 'test2');
  assert.match(m.htmlBody, /<img src="cid:hero"/);
  assert.ok(m.inlineImages.hero.bytes.length > 100);
  assert.ok(m.htmlBody.includes(`${EXEC}?page=details&amp;t=test2`));
  const off = gasMode(fresh());
  vm.runInContext("HERO_B64 = ''", off);
  const bare = confirmedMail(off, 'test2');
  assert.doesNotMatch(bare.htmlBody, /<img/);
  assert.equal(bare.inlineImages, undefined);
});

test('static mode: confirmation email keeps the hero URL', () => {
  const m = confirmedMail(fresh(), 'test2');
  assert.match(m.htmlBody, /<img src="http:\/\/localhost:5173\/assets\/hero\.jpg"/);
  assert.equal(m.inlineImages, undefined);
});

// ---- Host-only guard: top-level functions are public in an HtmlService web app ----

const fs = require('node:fs');
const path = require('node:path');
const GUEST_FACING = ['doGet', 'doPost', 'api', 'onOpen'];
const HOST_ONLY = ['setup', 'generateTokens', 'emailInvitesToSelection', 'textInvitesToSelection', 'installTriggers', 'flushNotifications', 'dailyRun'];
// Pure functions in logic.js: no Sheet, mail or network access, so a visitor calling them directly learns nothing.
const PURE = ['truthy', 'cleanText', 'daysBetween', 'dueMessages', 'partySize', 'board', 'canSeeAddress', 'notifyChannels',
  'validateRsvp', 'guestEmailOn', 'copyOverride', 'defaultCopy', 'fillTemplate', 'toParagraphs', 'settingsRows'];

const asVisitor = (ctx) => {
  ctx.Session = { getActiveUser: () => ({ getEmail: () => '' }), getEffectiveUser: () => ({ getEmail: () => 'host@example.com' }) };
  return ctx;
};
const callArgs = { dailyRun: "'" + before(14) + "'" };
const run = (ctx, name) => vm.runInContext(`${name}(${callArgs[name] || ''})`, ctx);

test('host-only functions refuse an anonymous visitor', () => {
  for (const name of HOST_ONLY) {
    const ctx = asVisitor(fresh());
    assert.throws(() => run(ctx, name), /Host only\./, name);
  }
});

test('host-only functions refuse a visitor who passes a forged trigger event or a date', () => {
  const ctx = asVisitor(fresh());
  ctx.ScriptApp.getProjectTriggers = () => [{ getUniqueId: () => 'real-uid' }];
  assert.throws(() => ctx.flushNotifications({ triggerUid: 'guess' }), /Host only\./);
  assert.throws(() => ctx.dailyRun({ triggerUid: 'guess' }), /Host only\./);
  assert.throws(() => ctx.dailyRun({ triggerUid: '' }), /Host only\./);
  assert.throws(() => ctx.dailyRun(before(14)), /Host only\./);
});

test('host-only functions run for the signed-in host', () => {
  for (const name of HOST_ONLY) {
    if (name === 'textInvitesToSelection' || name === 'emailInvitesToSelection') continue;
    const ctx = fresh();
    const chain = new Proxy(() => chain, { get: (_, k) => (k === 'create' ? () => {} : chain) });
    ctx.ScriptApp.newTrigger = chain;
    ctx.SpreadsheetApp.getActive = ((orig) => () => ({ ...orig(), toast() {} }))(ctx.SpreadsheetApp.getActive);
    assert.doesNotThrow(() => run(ctx, name), name);
  }
  const ctx = fresh();
  assert.doesNotThrow(() => vm.runInContext('emailInvitesToSelection()', ctx));
});

test('host-only functions run for a real trigger event', () => {
  const ctx = asVisitor(fresh());
  ctx.ScriptApp.getProjectTriggers = () => [{ getUniqueId: () => 'real-uid' }];
  assert.doesNotThrow(() => ctx.flushNotifications({ triggerUid: 'real-uid' }));
  assert.doesNotThrow(() => ctx.dailyRun({ triggerUid: 'real-uid' }));
});

test('guest-facing entry points still work for an anonymous visitor', () => {
  const ctx = asVisitor(fresh());
  assert.equal(call(ctx, { action: 'me', token: 'test1' }).ok, true);
  assert.equal(ctx.api(JSON.stringify({ action: 'me', token: 'test1' })).ok, true);
  assert.equal(ctx.doGet({ parameter: { page: 'index' } }).title, EV.title);
  assert.throws(() => ctx.onOpen(), /getUi/);
});

test('every public top-level function is guest-facing, pure, or guarded by hostOnly_', () => {
  const dir = path.join(__dirname);
  const found = {};
  for (const f of ['logic.js', 'Code.js', 'admin.js']) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/^(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*\{\n([^\n]*)/gm)) found[m[1]] = { file: f, first: m[2] };
    for (const m of src.matchAll(/^(?:var|let|const)\s+(\w+)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|\w+\s*=>)/gm)) found[m[1]] = { file: f, first: '' };
  }
  const bad = [];
  for (const [name, { file, first }] of Object.entries(found)) {
    if (name.endsWith('_')) continue;
    if (GUEST_FACING.includes(name)) continue;
    if (file === 'logic.js' && PURE.includes(name)) continue;
    if (HOST_ONLY.includes(name) && /^\s*hostOnly_\(/.test(first)) continue;
    bad.push(`${file}:${name}`);
  }
  assert.deepEqual(bad, [], 'new public function: end its name with _, or classify it (and guard it with hostOnly_ if it touches data)');
  for (const name of [...GUEST_FACING, ...HOST_ONLY]) assert.ok(found[name], name + ' is listed but missing');
});

test('built-in wording is what is sent when a cell is blank, and what setup pre-fills', () => {
  const ctx = withModules(fresh());
  const m = confirmedMail(ctx, 'test2');
  assert.equal(m.subject, `You're in! ${vm.runInContext('EVENT.title', ctx)}`);
  assert.match(m.htmlBody, /You're confirmed for/);
  const rows = JSON.parse(vm.runInContext("JSON.stringify(settingsRows(NOTIFY_ACTIONS, {}, { host_email: '', ntfy_topic: '', admin_key: '', modules: modules_() }))", ctx));
  const body = rows.find((r) => r.key === 'guest_confirmed_body').value;
  assert.match(body, /\{first_name\}/);
  assert.match(body, /\{can_do\}/);
  assert.equal(body, vm.runInContext("defaultCopy('confirmed', 'body', modules_())", ctx));
});

test('email palette comes from the generated theme, not hardcoded colors', () => {
  const ctx = withModules(fresh());
  vm.runInContext("EMAIL_THEME = { ...EMAIL_THEME, bg: '#0b1524', accent: '#ffbd59' }", ctx);
  const m = confirmedMail(ctx, 'test2');
  assert.match(m.htmlBody, /background:#0b1524/);
  assert.match(m.htmlBody, /background:#ffbd59/);
  assert.ok(!m.htmlBody.includes('#f2b25c') && !m.htmlBody.includes('#0f2523'));
});

test('a non-image hero is left out of emails', () => {
  const ctx = withModules(gasMode(fresh()));
  vm.runInContext("EVENT.images.hero.src = 'assets/hero.mp4'", ctx);
  assert.doesNotMatch(confirmedMail(ctx, 'test2').htmlBody, /<img/);
});

// ---- module-gated tabs and activities ----

const tabNames = (ctx) => JSON.parse(vm.runInContext('JSON.stringify(tabNames_())', ctx));
const withFeatures = (features) => {
  const ctx = makeContext({ ...structuredClone(FIXTURE), features });
  seed(ctx);
  return ctx;
};
const hasSheet = (ctx, n) => vm.runInContext(`!!sheet_('${n}')`, ctx);

test('setup creates Food/Trips/Activities only for modules that are on', () => {
  const off = withFeatures(['schedule', 'guest_list']);
  for (const n of ['Settings', 'Guests', 'Log']) assert.ok(hasSheet(off, n), n);
  for (const n of ['Food', 'Trips', 'Activities']) assert.ok(!hasSheet(off, n), n);
  const on = withFeatures(['menu', 'trips', 'activities']);
  for (const n of ['Food', 'Trips', 'Activities']) assert.ok(hasSheet(on, n), n);
  assert.deepEqual(tabNames(off), ['Settings', 'Guests', 'Log']);
});

test('with modules off, reads return empty and writes are refused', () => {
  const ctx = withFeatures(['schedule', 'guest_list']);
  const b = call(ctx, { action: 'board', token: 'test1' });
  assert.deepEqual([b.data.menu, b.data.trips, b.data.activities], [[], [], []]);
  assert.equal(call(ctx, { action: 'me', token: 'test1' }).ok, true);
  assert.equal(call(ctx, { action: 'admin', key: 'dev' }).data.food.length, 0);
  const slot = EV.food_slots[0].id;
  for (const body of [{ action: 'addFood', slot, item: 'Pie' }, { action: 'addTrip', title: 'Hike' }, { action: 'addActivity', title: 'Charades' }]) {
    assert.deepEqual(call(ctx, { ...body, token: 'test1' }), { ok: false, error: 'That part of the invite is turned off.' }, body.action);
  }
});

test('a module turned on after setup creates its missing tab on first write', () => {
  const ctx = withFeatures(['schedule', 'guest_list']);
  vm.runInContext("EVENT.features = ['activities', 'menu']", ctx);
  assert.ok(!hasSheet(ctx, 'Activities'));
  assert.equal(call(ctx, { action: 'addActivity', token: 'test1', title: 'Charades' }).ok, true);
  assert.ok(hasSheet(ctx, 'Activities'));
  assert.equal(call(ctx, { action: 'board', token: 'test1' }).data.activities[0].title, 'Charades');
  assert.equal(call(ctx, { action: 'addFood', token: 'test1', slot: EV.food_slots[0].id, item: 'Pie' }).ok, true);
  assert.ok(hasSheet(ctx, 'Food'));
});

test('prefilled confirmed wording sends byte-identical to a blank cell, with no dangling module sentence', () => {
  for (const features of [['menu', 'trips'], ['menu'], []]) {
    const kinds = ['confirmed'];
    const send = (prefill) => {
      const ctx = withFeatures(features);
      if (prefill) for (const f of ['subject', 'body']) setSetting(ctx, 'guest_confirmed_' + f, vm.runInContext(`defaultCopy('confirmed', '${f}', {menu:true,trips:true})`, ctx));
      return confirmedMail(ctx, 'test2');
    };
    for (const k of kinds) assert.equal(JSON.stringify(send(true)), JSON.stringify(send(false)), k + features);
    assert.doesNotMatch(send(true).htmlBody, /sign up on\s*(\.| and)|plan\s*\./);
  }
});

test('every guest email kind: a prefilled cell equals a blank cell', () => {
  const ctx = fresh();
  for (const k of ['invite', 'confirmed', 'remind', 'confirm']) {
    const run = (prefill) => {
      const s = prefill ? { [`guest_${k}_subject`]: vm.runInContext(`defaultCopy('${k}', 'subject', modules_())`, ctx), [`guest_${k}_body`]: vm.runInContext(`defaultCopy('${k}', 'body', modules_())`, ctx) } : {};
      return JSON.stringify(vm.runInContext(`guestCopy_('${k}', ${JSON.stringify(s)}, { first_name: 'A', title: 'T', when: 'W', days: 3 }, { invite_link: { html: '<a>x</a>' }, can_do: { html: 'You can. ' } })`, ctx));
    };
    assert.equal(run(true), run(false), k);
  }
});

test('setup never removes a tab that already exists', () => {
  const ctx = withFeatures(['menu', 'trips']);
  vm.runInContext("appendRow_('Trips', { id: 'keep', title: 'Mine' })", ctx);
  vm.runInContext("EVENT.features = ['schedule']; setup();", ctx);
  assert.ok(hasSheet(ctx, 'Trips'));
  assert.ok(vm.runInContext("rows_('Trips').some((t) => t.id === 'keep')", ctx));
});

test('activities: add, list, remove, validation', () => {
  const ctx = withFeatures(['activities']);
  assert.equal(call(ctx, { action: 'addActivity', token: 'test2', title: 'Charades' }).ok, false, 'invited guests cannot add');
  assert.equal(call(ctx, { action: 'addActivity', token: 'test1', title: '   ' }).ok, false);
  const { id } = call(ctx, { action: 'addActivity', token: 'test1', title: ' Charades ', details: 'Teams of 3' }).data;
  const list = call(ctx, { action: 'board', token: 'test3' }).data.activities;
  assert.deepEqual(list, [{ id, title: 'Charades', details: 'Teams of 3', by: 'Alex', mine: false }]);
  assert.equal(call(ctx, { action: 'removeActivity', token: 'test3', id }).ok, false, 'only the owner removes');
  assert.equal(call(ctx, { action: 'removeActivity', token: 'test1', id }).ok, true);
  assert.deepEqual(call(ctx, { action: 'board', token: 'test1' }).data.activities, []);
  const actions = JSON.parse(vm.runInContext("JSON.stringify(rows_('Log').map((l) => l.action))", ctx));
  assert.deepEqual(actions.filter((a) => a === 'activity').length, 2);
});
