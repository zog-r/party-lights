// Pure functions only: no Google APIs, so this file runs in Apps Script and under `node --test`.

const STATUSES = ['yes', 'maybe', 'no'];
const SLEEP = ['anywhere', 'request_room', 'not_staying'];

function truthy(v) {
  return v === true || /^(true|on|yes|1)$/i.test(String(v));
}

function cleanText(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

// Dates are 'YYYY-MM-DD' strings in the event's timezone; UTC math avoids DST off-by-ones.
function daysBetween(from, to) {
  const d = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((d(to) - d(from)) / 86400000);
}

function dueMessages(guests, eventDate, today, reminders) {
  const days = daysBetween(today, eventDate);
  const isConfirmDay = reminders.confirm_days.includes(days);
  const isRemindDay = reminders.remind_days.includes(days);
  const out = [];
  for (const g of guests) {
    if (isConfirmDay && g.status === 'yes') {
      if (!g['confirmed_' + days]) {
        const channel = g.email ? 'email' : g.phone ? 'text' : null;
        if (channel) out.push({ token: g.token, kind: 'confirm', days, channel });
      }
      continue;
    }
    if (isRemindDay && (g.status === 'yes' || g.status === 'maybe')) {
      if (truthy(g.remind_email) && g.email) out.push({ token: g.token, kind: 'remind', days, channel: 'email' });
      if (truthy(g.remind_text) && g.phone) out.push({ token: g.token, kind: 'remind', days, channel: 'text' });
    }
  }
  return out;
}

function partySize(g) {
  return (Number(g.adults) || 0) + (Number(g.kids) || 0);
}

function board(guests, settings) {
  const mode = settings.show_guest_list;
  const order = { yes: 0, maybe: 1, invited: 2 };
  const shown = mode === 'confirmed' ? ['yes'] : mode === 'all' ? ['yes', 'maybe', 'invited'] : [];
  const list = guests
    .map((g) => ({ ...g, status: g.status || 'invited' }))
    .filter((g) => shown.includes(g.status))
    .sort((a, b) => order[a.status] - order[b.status])
    .map((g) => ({ name: g.name, status: g.status, party: g.status === 'invited' ? null : partySize(g) }));
  const count = guests.filter((g) => g.status === 'yes').reduce((n, g) => n + partySize(g), 0);
  return {
    guests: shown.length ? list : null,
    count: truthy(settings.show_count) ? count : null,
  };
}

function canSeeAddress(g) {
  return g.status === 'yes';
}

function notifyChannels(action, settings) {
  return ['email', 'push'].filter((ch) => truthy(settings['notify_' + action + '_' + ch]));
}

function validateRsvp(input, stayDays) {
  const status = String(input.status);
  if (!STATUSES.includes(status)) throw new Error('Pick yes, maybe, or no.');
  const base = { status, adults: 0, kids: 0, party_names: '', arrive: '', depart: '', sleep: '', room_reason: '', dietary: '',
    remind_email: truthy(input.remind_email), remind_text: truthy(input.remind_text) };
  if (status === 'no') return base;

  const int = (v) => Math.max(0, Math.min(20, parseInt(v, 10) || 0));
  const r = { ...base, adults: int(input.adults), kids: int(input.kids) };
  if (r.adults < 1) throw new Error('At least one adult, please.');

  const ai = input.arrive ? stayDays.indexOf(input.arrive) : -1;
  const di = input.depart ? stayDays.indexOf(input.depart) : -1;
  if ((input.arrive && ai < 0) || (input.depart && di < 0)) throw new Error('Unknown day.');
  if (ai >= 0 && di >= 0 && di < ai) throw new Error('Departure is before arrival.');
  r.arrive = input.arrive || '';
  r.depart = input.depart || '';

  if (input.sleep && !SLEEP.includes(input.sleep)) throw new Error('Unknown sleeping option.');
  r.sleep = input.sleep || '';
  r.room_reason = r.sleep === 'request_room' ? cleanText(input.room_reason, 500) : '';
  r.party_names = cleanText(input.party_names, 200);
  r.dietary = cleanText(input.dietary, 200);
  return r;
}

// ---- Settings tab layout (labels are display-only; the backend always reads rows by key) ----

const NOTIFY_PHRASES = {
  rsvp: 'RSVPs',
  cancel: 'cancels',
  room_request: 'asks for a room',
  confirm: 'confirms they\'re still coming',
  food: 'signs up to bring food',
  trip: 'adds or joins a day trip',
};

// `subject` and `body` are the built-in wording, written with the same {placeholders} a host may use. They are the one
// source for both what gets sent when a Settings cell is blank and what setup pre-fills into that cell. `m` says which
// optional modules are on; no default needs it now (module-dependent wording is a send-time placeholder).
const GUEST_EMAILS = {
  invite: { name: 'Invite email', when: 'when you use Invite app → Email invites', vars: '{first_name} {title} {when} {invite_link}',
    subject: () => "You're invited: {title}",
    body: () => 'Hi {first_name}!\n\nYou\'re invited to {title}: {when}.\n\nSee the details and RSVP: {invite_link}' },
  confirmed: { name: '"You\'re in" email', when: 'the first time a guest RSVPs yes', vars: '{first_name} {title} {when} {invite_link} {menu_link} {trips_link} {calendar_link} {can_do}',
    subject: () => "You're in! {title}",
    // {can_do} is filled when the email is sent, from the modules that are on, so this text never goes stale.
    body: () => ['Hi {first_name}!',
      "You're confirmed for {title} ({when}). Add it to your calendar: {calendar_link}.",
      '{can_do}See everything on {invite_link}.',
      'Expect a reminder to confirm your plans closer to the day!',
      "I'm excited to host you!",
      'Cheers!\nYour host'].join('\n\n') },
  remind: { name: 'Reminder email', when: 'on the reminder days, to guests who opted in', vars: '{first_name} {title} {when} {days} {invite_link}',
    subject: () => '{days} days until {title}',
    body: () => 'Hi {first_name}!\n\n{days} days until {title} ({when}).\n\nYour invite: {invite_link}' },
  confirm: { name: 'Still-coming check email', when: 'on the confirm days, to guests who said yes', vars: '{first_name} {title} {when} {days} {invite_link}',
    subject: () => 'Still coming? Confirm for {title}',
    body: () => 'Hi {first_name}!\n\n{title} is {days} days out. Still coming? Tap to confirm: {invite_link}' },
};

function defaultCopy(kind, field, modules) {
  return GUEST_EMAILS[kind][field](modules || {});
}

function guestEmailOn(kind, settings) {
  const v = settings['guest_' + kind + '_email'];
  return v === undefined || v === '' || truthy(v);
}

function copyOverride(kind, field, settings) {
  const v = settings['guest_' + kind + '_' + field];
  return String(v == null ? '' : v).trim().slice(0, 5000);
}

// Placeholders {name} are filled from vars; unknown ones stay as typed. A var of {html} is trusted markup (links).
function fillTemplate(text, vars, esc) {
  return String(text).split(/(\{\w+\})/).map((part) => {
    const m = /^\{(\w+)\}$/.exec(part);
    if (!m || !(m[1] in vars)) return esc(part);
    const v = vars[m[1]];
    return v && v.html !== undefined ? v.html : esc(v);
  }).join('');
}

// Blank line = new paragraph; a single newline = line break. Input is already escaped HTML.
function toParagraphs(html) {
  return String(html).split(/\n\s*\n/).map((p) => p.trim().replace(/\n/g, '<br>')).filter(Boolean);
}

// Rows for the Settings tab in display order. Existing values/notes (keyed by key) win over defaults; unknown keys are kept.
function settingsRows(actions, existing, runtime) {
  const groups = [
    ['Basics', [
      ['site_url', 'Website address', '', 'Leave blank: your pages are served by Google. Only fill this in if you host the pages yourself (for example on Vercel), with no trailing slash.'],
      ['host_email', 'Your email', runtime.host_email, 'Where your alerts and the daily text-a-guest digest are sent.'],
      ['admin_key', 'Host page password', runtime.admin_key, 'Secret for your host page: open site/admin.html?k=<this>. Keep it private.'],
      ['show_guest_list', 'Guest list on the site', 'confirmed', 'Who guests can see on the guest list: off, confirmed (only guests who said yes) or all.'],
      ['show_count', 'Show headcount', true, 'Tick to show guests the total number of people coming.'],
    ]],
    ['Private details', [
      ['address', 'Street address', '', 'Shown only to guests who RSVP yes.'],
      ['directions', 'Directions and arrival notes', '', 'Parking, gate code, arrival notes. Shown only to guests who RSVP yes.'],
    ]],
    ['Alerts to me', [
      ['ntfy_topic', 'Phone alerts topic (ntfy)', runtime.ntfy_topic, 'Push alerts to your phone via the free ntfy app: subscribe to this topic name there. Never sent to guests.'],
      ...actions.flatMap((a) => [
        ['notify_' + a + '_email', `Email me when a guest ${NOTIFY_PHRASES[a] || a}`, ['rsvp', 'cancel', 'room_request'].includes(a), 'Tick to get an email at your address above; untick for none.'],
        ['notify_' + a + '_push', `Phone alert when a guest ${NOTIFY_PHRASES[a] || a}`, true, 'Tick to get a push alert on your phone (needs the ntfy topic above); untick for none.'],
      ]),
    ]],
    ['Emails to guests', [
      ['guest_from_name', 'Sender name', '', 'The name guests see on emails from you. Blank uses your Google account name.'],
      ['guest_reply_to', 'Reply-to email', '', 'Where guest replies go. Blank uses your Google account address.'],
      ...Object.entries(GUEST_EMAILS).flatMap(([k, e]) => [
        ['guest_' + k + '_email', `Send the ${e.name}`, true, `Tick to send this email ${e.when}; untick to turn it off.`],
        ['guest_' + k + '_subject', `${e.name}: subject`, defaultCopy(k, 'subject', runtime.modules),
          `Edit the words, keep the {curly} parts: each one is replaced with that guest's details (${e.vars}). Clear the cell to go back to this wording.`],
        ['guest_' + k + '_body', `${e.name}: message`, defaultCopy(k, 'body', runtime.modules),
          `Edit the words, keep the {curly} parts: each one is replaced with that guest's details (${e.vars}). A blank line starts a new paragraph. Clear the cell to go back to this wording.`],
      ]),
    ]],
  ];
  const known = new Set();
  const out = [];
  for (const [heading, rows] of groups) {
    out.push({ heading });
    for (const [key, label, dflt, note] of rows) {
      known.add(key);
      // A blank email subject/body means "built-in wording", so it is refilled. Any other blank (ntfy topic, host
      // email, admin key) is the host switching that off and stays blank; a blank toggle keeps its default.
      const old = key in existing ? existing[key].value : undefined;
      const refill = /^guest_\w+_(subject|body)$/.test(key);
      const value = old === undefined || (old === '' && (refill || typeof dflt === 'boolean')) ? dflt : old;
      out.push({ key, label, value: typeof dflt === 'boolean' ? truthy(value) : value, note });
    }
  }
  const extra = Object.keys(existing).filter((k) => !known.has(k));
  if (extra.length) out.push({ heading: 'Other' });
  for (const key of extra) out.push({ key, label: key, value: existing[key].value, note: existing[key].note || '' });
  return out;
}

if (typeof module !== 'undefined') {
  module.exports = { truthy, cleanText, daysBetween, dueMessages, partySize, board, canSeeAddress, notifyChannels, validateRsvp,
    guestEmailOn, copyOverride, defaultCopy, fillTemplate, toParagraphs, settingsRows, GUEST_EMAILS };
}
