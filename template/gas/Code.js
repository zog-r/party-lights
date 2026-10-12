// JSON API for the static site. The container Google Sheet is the database and admin panel.

const TABS = {
  Settings: ['key', 'label', 'value', 'note'],
  // A getter: Apps Script loads Code.js before event.gen.js defines EVENT.
  get Guests() {
    return ['token', 'name', 'email', 'phone', 'status', 'adults', 'kids', 'party_names', 'arrive', 'depart',
      'sleep', 'room_reason', 'assigned_room', 'remind_email', 'remind_text', ...confirmCols_(), 'updated_at', 'dietary'];
  },
  Food: ['id', 'token', 'slot', 'item', 'created_at'],
  Trips: ['id', 'proposer_token', 'title', 'details', 'day', 'host_token', 'joiner_tokens', 'created_at'],
  Activities: ['id', 'token', 'title', 'details', 'created_at'],
  Log: ['ts', 'token', 'action', 'detail', 'notified'],
};

// Tabs that exist only when their module is on; every other tab is core.
const TAB_MODULE = { Food: 'menu', Trips: 'trips', Activities: 'activities' };

// ?ping=1 answers JSON (the setup scripts use it); anything else serves one of the generated pages (scripts/build-gas-site.js).
function doGet(e) {
  const params = (e && e.parameter) || {};
  if (params.ping) return json_({ ok: true, title: EVENT.title });
  const page = PAGES.includes(params.page) ? params.page : 'index';
  const html = HtmlService.createHtmlOutputFromFile('page_' + page).getContent();
  return HtmlService.createHtmlOutput(withGas_(html, { base: ScriptApp.getService().getUrl(), params }))
    .setTitle(EVENT.title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Adds <base target="_top"> (links leave the sandbox iframe) and window.GAS ahead of the page's own scripts.
function withGas_(html, gas) {
  const json = JSON.stringify(gas).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const inject = `<script>window.GAS = ${json};</script>\n`;
  return html.replace('<head>', () => '<head>\n<base target="_top">').replace('<script', () => inject + '<script');
}

function doPost(e) {
  try {
    return json_(handle_(JSON.parse(e.postData.contents)));
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

// google.script.run entry point for the pages served by doGet: same routing as doPost, returned as a plain object.
function api(json) {
  try {
    return handle_(JSON.parse(json));
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

function handle_(req) {
  try {
    const handler = ACTIONS[req.action];
    if (!handler) throw new Error('Unknown action.');
    if (req.action === 'admin') return { ok: true, data: handler(req) };
    const guest = findGuest_(req.token);
    if (!guest) return { ok: false, error: 'bad_token' };
    return { ok: true, data: handler(req, guest) };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

const ACTIONS = {
  me(req, g) {
    const s = settings_();
    const food = rows_('Food').filter((f) => f.token === g.token).map((f) => ({ id: f.id, slot: f.slot, item: f.item }));
    const out = { guest: publicGuest_(g), food, remind_days: EVENT.reminders.confirm_days };
    if (canSeeAddress(g)) {
      out.address = s.address || '';
      out.directions = s.directions || '';
    }
    return out;
  },

  rsvp(req, g) {
    const r = validateRsvp(req.rsvp || {}, EVENT.stay_days.map((d) => d.id));
    return withLock_(() => {
      const prev = g.status;
      updateRow_('Guests', g._row, { ...r, updated_at: now_() });
      const action = r.status === 'no' && prev === 'yes' ? 'cancel' : 'rsvp';
      log_(g.token, action, `${g.name}: ${r.status} (${r.adults}+${r.kids})`);
      if (r.status === 'yes' && prev !== 'yes' && g.email) log_(g.token, 'guest_confirmed', g.email);
      if (r.sleep === 'request_room' && g.sleep !== 'request_room') {
        log_(g.token, 'room_request', `${g.name}: ${r.room_reason}`);
      }
      return ACTIONS.me(req, { ...g, ...r });
    });
  },

  confirm(req, g) {
    const days = Number(req.days);
    if (!EVENT.reminders.confirm_days.includes(days)) throw new Error('Unknown confirmation.');
    if (g.status !== 'yes') throw new Error('RSVP yes first.');
    return withLock_(() => {
      updateRow_('Guests', g._row, { ['confirmed_' + days]: now_() });
      log_(g.token, 'confirm', `${g.name} confirmed (${days}-day check)`);
      return { confirmed: days };
    });
  },

  addFood(req, g) {
    requireMod_('menu');
    if (g.status !== 'yes' && g.status !== 'maybe') throw new Error('RSVP first, then pick a dish.');
    if (!EVENT.food_slots.some((s) => s.id === req.slot)) throw new Error('Unknown menu slot.');
    const item = cleanText(req.item, 80);
    if (!item) throw new Error('What are you bringing?');
    return withLock_(() => {
      const id = Utilities.getUuid().slice(0, 8);
      appendRow_('Food', { id, token: g.token, slot: req.slot, item, created_at: now_() });
      log_(g.token, 'food', `${g.name}: ${item} (${req.slot})`);
      return { id };
    });
  },

  removeFood(req, g) {
    return withLock_(() => {
      const f = rows_('Food').find((x) => x.id === req.id && x.token === g.token);
      if (!f) throw new Error('Not found.');
      sheet_('Food').deleteRow(f._row);
      log_(g.token, 'food', `${g.name} removed ${f.item}`);
      return { removed: req.id };
    });
  },

  board(req, g) {
    const guests = rows_('Guests');
    const names = Object.fromEntries(guests.map((x) => [x.token, firstName_(x.name)]));
    const out = board(guests, settings_());
    out.menu = rows_('Food').map((f) => ({ slot: f.slot, item: f.item, by: names[f.token] || '', mine: f.token === g.token }));
    out.activities = rows_('Activities').map((a) => ({ id: a.id, title: a.title, details: a.details, by: names[a.token] || '', mine: a.token === g.token }));
    out.trips = rows_('Trips').map((t) => {
      const joiners = splitTokens_(t.joiner_tokens);
      return { id: t.id, title: t.title, details: t.details, day: t.day,
        proposer: names[t.proposer_token] || '', host: names[t.host_token] || '',
        joiners: joiners.map((x) => names[x]).filter(Boolean),
        joined: joiners.includes(g.token), hosting: t.host_token === g.token };
    });
    return out;
  },

  // Anyone who is coming can add a game or activity; they are the one running it.
  addActivity(req, g) {
    requireMod_('activities');
    if (g.status !== 'yes' && g.status !== 'maybe') throw new Error('RSVP first, then add a game.');
    const title = cleanText(req.title, 80);
    if (!title) throw new Error('What is the game or activity?');
    return withLock_(() => {
      const id = Utilities.getUuid().slice(0, 8);
      appendRow_('Activities', { id, token: g.token, title, details: cleanText(req.details, 300), created_at: now_() });
      log_(g.token, 'activity', `${g.name} added: ${title}`);
      return { id };
    });
  },

  removeActivity(req, g) {
    return withLock_(() => {
      const a = rows_('Activities').find((x) => x.id === req.id && x.token === g.token);
      if (!a) throw new Error('Not found.');
      sheet_('Activities').deleteRow(a._row);
      log_(g.token, 'activity', `${g.name} removed ${a.title}`);
      return { removed: req.id };
    });
  },

  addTrip(req, g) {
    requireMod_('trips');
    const title = cleanText(req.title, 80);
    if (!title) throw new Error('Give the trip a name.');
    return withLock_(() => {
      const id = Utilities.getUuid().slice(0, 8);
      appendRow_('Trips', { id, proposer_token: g.token, title, details: cleanText(req.details, 500),
        day: cleanText(req.day, 20), host_token: req.host ? g.token : '', joiner_tokens: g.token, created_at: now_() });
      log_(g.token, 'trip', `${g.name} proposed: ${title}`);
      return { id };
    });
  },

  // op: join | leave | host | unhost
  trip(req, g) {
    return withLock_(() => {
      const t = rows_('Trips').find((x) => x.id === req.id);
      if (!t) throw new Error('Trip not found.');
      let joiners = splitTokens_(t.joiner_tokens).filter((x) => x !== g.token);
      const patch = {};
      if (req.op === 'join' || req.op === 'host') joiners.push(g.token);
      if (req.op === 'host') {
        if (t.host_token && t.host_token !== g.token) throw new Error('Someone is already hosting.');
        patch.host_token = g.token;
      }
      if ((req.op === 'unhost' || req.op === 'leave') && t.host_token === g.token) patch.host_token = '';
      if (req.op === 'unhost') joiners.push(g.token);
      patch.joiner_tokens = joiners.join(',');
      updateRow_('Trips', t._row, patch);
      log_(g.token, 'trip', `${g.name} ${req.op}: ${t.title}`);
      return { ok: true };
    });
  },

  admin(req) {
    const s = settings_();
    if (!s.admin_key || req.key !== s.admin_key) throw new Error('Not authorized.');
    return {
      site_url: s.site_url,
      guests: rows_('Guests').map(({ _row, ...g }) => g),
      food: rows_('Food').map(({ _row, ...f }) => f),
      log: rows_('Log').slice(-50).reverse().map(({ _row, ...l }) => l),
    };
  },
};

// ---- sheet helpers ----

function sheet_(name) {
  return SpreadsheetApp.getActive().getSheetByName(name);
}

// A tab whose module is off was never created: reads see no rows.
function rows_(name) {
  if (!sheet_(name)) return [];
  const values = sheet_(name).getDataRange().getValues();
  const head = values.shift();
  return values
    .map((r, i) => {
      const o = { _row: i + 2 };
      head.forEach((h, j) => (o[h] = r[j] instanceof Date ? r[j].toISOString() : r[j]));
      return o;
    })
    .filter((o) => o[head[0]] !== '');
}

function requireMod_(id) {
  if (!modOn_(id)) throw new Error('That part of the invite is turned off.');
}

// Tabs for the modules this event uses (all core tabs always). Never touches a tab that already exists.
function tabNames_() {
  return Object.keys(TABS).filter((n) => !TAB_MODULE[n] || modOn_(TAB_MODULE[n]));
}

// Writes create a missing tab (a Sheet set up before its module existed, or a module turned on later) rather than crash.
function writeSheet_(name) {
  const sh = sheet_(name);
  if (sh) return sh;
  const made = SpreadsheetApp.getActive().insertSheet(name);
  made.getRange(1, 1, 1, TABS[name].length).setValues([TABS[name]]).setFontWeight('bold');
  made.setFrozenRows(1);
  return made;
}

function appendRow_(name, obj) {
  writeSheet_(name).appendRow(TABS[name].map((h) => (obj[h] === undefined ? '' : obj[h])));
}

function updateRow_(name, row, patch) {
  const sh = writeSheet_(name);
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  for (const [k, v] of Object.entries(patch)) {
    const col = head.indexOf(k);
    if (col >= 0) sh.getRange(row, col + 1).setValue(v);
  }
}

function findGuest_(token) {
  if (!token || typeof token !== 'string') return null;
  const g = rows_('Guests').find((x) => x.token === token);
  if (g) g.status = g.status || 'invited';
  return g || null;
}

function settings_() {
  const out = {};
  rows_('Settings').forEach((r) => (out[r.key] = r.value));
  return out;
}

// Notifications are sent by flushNotifications() on a timer, not here: UrlFetch/MailApp can take
// tens of seconds from Apps Script and guests shouldn't wait on them.
function log_(token, action, detail) {
  appendRow_('Log', { ts: now_(), token, action, detail });
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function confirmCols_() {
  return EVENT.reminders.confirm_days.map((d) => 'confirmed_' + d);
}

function publicGuest_(g) {
  const keep = ['name', 'status', 'adults', 'kids', 'party_names', 'arrive', 'depart', 'sleep', 'room_reason',
    'assigned_room', 'remind_email', 'remind_text', 'dietary', ...confirmCols_()];
  return Object.fromEntries(keep.map((k) => [k, g[k]]));
}

function splitTokens_(s) {
  return String(s || '').split(',').filter(Boolean);
}

function firstName_(name) {
  return String(name || '').split(/\s+/)[0];
}

function now_() {
  return new Date().toISOString();
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
