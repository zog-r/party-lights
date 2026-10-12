const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('./logic.js');

const EVENT = '2026-12-12';
const REM = { remind_days: [30, 14], confirm_days: [14, 5] };
const STAY = ['fri', 'sat', 'sun'];

const g = (o) => ({ token: 't', name: 'A', email: 'a@example.com', phone: '', status: 'yes', adults: 1, kids: 0,
  remind_email: false, remind_text: false, confirmed_14: '', confirmed_5: '', ...o });

test('daysBetween counts calendar days', () => {
  assert.equal(L.daysBetween('2026-11-12', EVENT), 30);
  assert.equal(L.daysBetween('2026-12-12', EVENT), 0);
  assert.equal(L.daysBetween('2026-03-07', '2026-03-09'), 2); // across DST
});

test('dueMessages: 30-day reminder only to opted-in yes/maybe guests', () => {
  const guests = [
    g({ token: 'a', remind_email: true }),
    g({ token: 'b', status: 'maybe', remind_text: true, phone: '555' }),
    g({ token: 'b2', status: 'maybe', remind_text: true }),
    g({ token: 'c', remind_email: false }),
    g({ token: 'd', status: 'no', remind_email: true }),
    g({ token: 'e', status: 'invited', remind_email: true }),
  ];
  const due = L.dueMessages(guests, EVENT, '2026-11-12', REM);
  assert.deepEqual(due, [
    { token: 'a', kind: 'remind', days: 30, channel: 'email' },
    { token: 'b', kind: 'remind', days: 30, channel: 'text' },
  ]);
});

test('dueMessages: confirm gate goes to every yes guest, replaces reminder same day', () => {
  const guests = [
    g({ token: 'a', remind_email: true }),
    g({ token: 'b', remind_email: false, email: '' , phone: '555' }),
    g({ token: 'c', status: 'maybe', remind_email: true }),
    g({ token: 'd', confirmed_14: '2026-11-27' }),
  ];
  const due = L.dueMessages(guests, EVENT, '2026-11-28', REM);
  assert.deepEqual(due, [
    { token: 'a', kind: 'confirm', days: 14, channel: 'email' },
    { token: 'b', kind: 'confirm', days: 14, channel: 'text' },
    { token: 'c', kind: 'remind', days: 14, channel: 'email' },
  ]);
});

test('dueMessages: nothing on off days', () => {
  assert.deepEqual(L.dueMessages([g({ remind_email: true })], EVENT, '2026-11-20', REM), []);
});

test('board respects visibility settings and never leaks contact info', () => {
  const guests = [
    g({ token: 'a', name: 'Ann', adults: 2, kids: 1 }),
    g({ token: 'b', name: 'Bo', status: 'invited' }),
    g({ token: 'c', name: 'Cy', status: 'no' }),
    g({ token: 'd', name: 'Di', status: 'maybe' }),
  ];
  const off = L.board(guests, { show_guest_list: 'off', show_count: false });
  assert.deepEqual(off, { guests: null, count: null });

  const conf = L.board(guests, { show_guest_list: 'confirmed', show_count: 'TRUE' });
  assert.deepEqual(conf, { guests: [{ name: 'Ann', status: 'yes', party: 3 }], count: 3 });

  const all = L.board(guests, { show_guest_list: 'all', show_count: true });
  assert.deepEqual(all.guests.map((x) => x.name), ['Ann', 'Di', 'Bo']);
  assert.ok(!JSON.stringify(all).includes('a@example.com'));

  const blank = L.board([g({ token: 'e', name: 'Ed', status: '' })], { show_guest_list: 'all', show_count: false });
  assert.deepEqual(blank.guests, [{ name: 'Ed', status: 'invited', party: null }]);
});

test('address only for yes', () => {
  assert.equal(L.canSeeAddress(g({ status: 'yes' })), true);
  assert.equal(L.canSeeAddress(g({ status: 'maybe' })), false);
});

test('notifyChannels reads toggles', () => {
  const s = { notify_rsvp_email: true, notify_rsvp_push: 'FALSE', notify_food_push: 'TRUE' };
  assert.deepEqual(L.notifyChannels('rsvp', s), ['email']);
  assert.deepEqual(L.notifyChannels('food', s), ['push']);
  assert.deepEqual(L.notifyChannels('trip', s), []);
});

test('validateRsvp accepts good input and clamps text', () => {
  const r = L.validateRsvp({ status: 'yes', adults: '2', kids: 1, arrive: 'fri', depart: 'sun',
    sleep: 'request_room', room_reason: 'x'.repeat(900), remind_email: true, remind_text: 'on', party_names: ' Ann, Bo ', dietary: ' nut allergy ' }, STAY);
  assert.equal(r.adults, 2);
  assert.equal(r.room_reason.length, 500);
  assert.equal(r.remind_text, true);
  assert.equal(r.party_names, 'Ann, Bo');
  assert.equal(r.dietary, 'nut allergy');
});

test('validateRsvp rejects bad input', () => {
  assert.throws(() => L.validateRsvp({ status: 'lol' }, STAY));
  assert.throws(() => L.validateRsvp({ status: 'yes', adults: 0, kids: 0 }, STAY));
  assert.throws(() => L.validateRsvp({ status: 'yes', adults: 1, arrive: 'sun', depart: 'fri' }, STAY));
  assert.throws(() => L.validateRsvp({ status: 'yes', adults: 1, sleep: 'roof' }, STAY));
  assert.equal(L.validateRsvp({ status: 'no' }, STAY).status, 'no');
});

test('cleanText trims, strips control chars, caps length', () => {
  assert.equal(L.cleanText('  hi\u0000 there ', 5), 'hi th');
  assert.equal(L.cleanText(undefined, 5), '');
});

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

test('fillTemplate fills known placeholders, escapes values, keeps unknown ones', () => {
  const out = L.fillTemplate('Hi {first_name}, {nope} <b>{title}</b> {link}', { first_name: '<i>Al</i>', title: 'A & B', link: { html: '<a>x</a>' } }, esc);
  assert.equal(out, 'Hi &lt;i&gt;Al&lt;/i&gt;, {nope} &lt;b&gt;A &amp; B&lt;/b&gt; <a>x</a>');
});

test('toParagraphs splits on blank lines and keeps single newlines as breaks', () => {
  assert.deepEqual(L.toParagraphs('One\nTwo\n\n\n  Three  \n\n'), ['One<br>Two', 'Three']);
});

test('guestEmailOn defaults to on and reads toggles', () => {
  assert.equal(L.guestEmailOn('invite', {}), true);
  assert.equal(L.guestEmailOn('invite', { guest_invite_email: '' }), true);
  assert.equal(L.guestEmailOn('invite', { guest_invite_email: false }), false);
  assert.equal(L.guestEmailOn('confirm', { guest_confirm_email: 'FALSE' }), false);
  assert.equal(L.guestEmailOn('remind', { guest_invite_email: false }), true);
});

test('copyOverride trims, keeps newlines, blank means no override', () => {
  assert.equal(L.copyOverride('confirmed', 'body', { guest_confirmed_body: '  a\n\nb ' }), 'a\n\nb');
  assert.equal(L.copyOverride('confirmed', 'body', {}), '');
});

test('settingsRows: labels and notes for every row, grouped, existing values kept, keys never renamed', () => {
  const existing = {
    site_url: { key: 'site_url', value: 'https://x.test', note: 'old' },
    notify_rsvp_email: { key: 'notify_rsvp_email', value: false },
    custom_thing: { key: 'custom_thing', value: 'keep', note: 'mine' },
  };
  const rows = L.settingsRows(['rsvp', 'food'], existing, { host_email: 'host@example.com', ntfy_topic: 't', admin_key: 'k' });
  const keyed = Object.fromEntries(rows.filter((r) => r.key).map((r) => [r.key, r]));
  assert.deepEqual(rows.filter((r) => r.heading).map((r) => r.heading), ['Basics', 'Private details', 'Alerts to me', 'Emails to guests', 'Other']);
  for (const r of rows.filter((x) => x.key)) assert.ok(r.label && r.note, r.key);
  assert.equal(keyed.site_url.value, 'https://x.test');
  assert.equal(keyed.notify_rsvp_email.value, false);
  assert.equal(keyed.notify_food_push.value, true);
  assert.equal(keyed.host_email.value, 'host@example.com');
  assert.equal(keyed.guest_confirmed_email.value, true);
  assert.deepEqual(keyed.custom_thing, { key: 'custom_thing', label: 'custom_thing', value: 'keep', note: 'mine' });
  assert.match(keyed.guest_invite_body.value, /\{first_name\}.*\{invite_link\}/s);
  assert.match(keyed.guest_invite_body.note, /keep the \{curly\} parts/);
  assert.match(keyed.ntfy_topic.note, /never sent to guests/i);
});

test('settingsRows pre-fills built-in email wording, never overwrites an edit, and refills a cleared cell', () => {
  const run = (existing, modules) => Object.fromEntries(L.settingsRows([], existing, { host_email: '', ntfy_topic: '', admin_key: '', modules })
    .filter((r) => r.key).map((r) => [r.key, r.value]));
  const both = { menu: true, trips: true };
  for (const k of Object.keys(L.GUEST_EMAILS)) {
    const v = run({}, both);
    assert.equal(v['guest_' + k + '_subject'], L.defaultCopy(k, 'subject', both));
    assert.equal(v['guest_' + k + '_body'], L.defaultCopy(k, 'body', both));
  }
  const edited = run({ guest_confirmed_body: { value: 'My own words, {first_name}.' }, guest_confirmed_subject: { value: '' } }, both);
  assert.equal(edited.guest_confirmed_body, 'My own words, {first_name}.');
  assert.equal(edited.guest_confirmed_subject, L.defaultCopy('confirmed', 'subject', both));
});

test('confirmed default wording is module-independent', () => {
  for (const m of [{ menu: true, trips: true }, { menu: false, trips: false }, undefined]) {
    const b = L.defaultCopy('confirmed', 'body', m);
    assert.match(b, /\{can_do\}/);
    assert.doesNotMatch(b, /menu_link|trips_link/);
  }
});

test('settingsRows: only blank email wording is refilled; blank ntfy/host/admin stay off; blank toggles keep their default', () => {
  const blank = (k) => ({ value: '' });
  const keys = ['ntfy_topic', 'admin_key', 'host_email', 'guest_invite_email', 'notify_rsvp_email', 'guest_invite_subject', 'guest_remind_body'];
  const existing = Object.fromEntries(keys.map((k) => [k, blank(k)]));
  const v = Object.fromEntries(L.settingsRows(['rsvp'], existing, { host_email: 'h@x.test', ntfy_topic: 't', admin_key: 'k', modules: {} })
    .filter((r) => r.key).map((r) => [r.key, r.value]));
  assert.deepEqual([v.ntfy_topic, v.admin_key, v.host_email], ['', '', '']);
  assert.equal(v.guest_invite_email, true);
  assert.equal(v.notify_rsvp_email, true);
  assert.equal(v.guest_invite_subject, L.defaultCopy('invite', 'subject'));
  assert.equal(v.guest_remind_body, L.defaultCopy('remind', 'body'));
});
