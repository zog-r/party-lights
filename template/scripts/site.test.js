// Static checks on site/: every page is private, themed, and wired to the shared stylesheet.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', 'site');
const pages = fs.readdirSync(dir).filter((f) => f.endsWith('.html'));
const css = fs.readFileSync(path.join(dir, 'styles.css'), 'utf8');

test('every page is noindex, has the favicon, and loads styles.css + app.js', () => {
  for (const p of pages) {
    const html = fs.readFileSync(path.join(dir, p), 'utf8');
    assert.match(html, /<meta name="robots" content="noindex">/, p);
    assert.match(html, /href="favicon.svg"/, p);
    assert.match(html, /href="styles.css"/, p);
    assert.match(html, /src="app.js"/, p);
  }
});

test('no leftovers from the old cream theme', () => {
  assert.doesNotMatch(css, /--cream|--berry|--paper/);
  for (const p of pages) assert.doesNotMatch(fs.readFileSync(path.join(dir, p), 'utf8'), /btn berry|var\(--(cream|ink|paper|berry)\)/, p);
});

test('design tokens live in styles.css only', () => {
  for (const t of ['--pine:', '--glow:', '--linen:', '--mist:']) assert.ok(css.includes(t), t);
  for (const p of ['index.html', 'house.html'].filter((f) => pages.includes(f))) assert.doesNotMatch(fs.readFileSync(path.join(dir, p), 'utf8'), /--pine:|--linen:/, p);
});

test('referenced assets exist', () => {
  const files = [css, ...pages.map((p) => fs.readFileSync(path.join(dir, p), 'utf8'))].join('\n');
  for (const [, a] of files.matchAll(/assets\/([\w.-]+)/g)) assert.ok(fs.existsSync(path.join(dir, 'assets', a)), a);
});

test('calendar spans the stay as all-day with an exclusive end, unless calendar.span is "main"', () => {
  const ctx = { location: { search: '', hostname: 'x', origin: '', pathname: '/' }, localStorage: { getItem: () => null, setItem() {} },
    fetch: () => new Promise(() => {}), document: { querySelectorAll: () => [] }, URLSearchParams, Intl, Date, encodeURIComponent };
  const App = require('node:vm').runInNewContext(fs.readFileSync(path.join(dir, 'app.js'), 'utf8') + '; App', ctx);
  const ev = require('./example-event.fixture.json'); // the example's stay and schedule, not the host's
  const me = {};
  assert.deepStrictEqual({ ...App.calendarSpan(ev) }, { allDay: true, start: '20261218', end: '20261221' });
  assert.match(App.calendar(ev, me).google, /dates=20261218%2F20261221/);
  const ics = decodeURIComponent(App.calendar(ev, me).ics);
  assert.match(ics, /DTSTART;VALUE=DATE:20261218\r\nDTEND;VALUE=DATE:20261221/);
  assert.match(ics, /Main event: Winter supper/);
  const main = App.calendarSpan({ ...ev, calendar: { span: 'main' } });
  assert.deepStrictEqual({ ...main }, { allDay: false, start: '20261220T000000Z', end: '20261220T060000Z' });
  assert.strictEqual(App.calendarSpan({ ...ev, stay: undefined }).allDay, false);
});

// Copy that belongs to one optional module (ids from fields.json). It may only sit in markup under data-module="<id>", so an
// event without that module never shows it. App.prune removes the tagged elements on load.
const VOCAB = {
  stay: /\b(stay(ing)?|overnight|sleep(ing)?|arriv(e|ing)|leaving|weekend)\b/i,
  rooms: /\b(rooms?|beds?|bedrooms?)\b/i,
  trips: /\b(day )?trips?\b/i,
  place: /\bhouse\b/i,
  schedule: /\b(schedule|agenda|itinerary|day-by-day|full plan)\b/i,
  menu: /\b(potluck|menu)\b/i,
  guest_list: /\bguest list\b/i,
  reminders: /\bremind(er|ers)?\b/i,
  activities: /\b(games?|activit(y|ies))\b/i,
  gift_exchange: /\b(gift|secret santa|white elephant)\b/i,
  vibe: /\bdress code\b/i,
};

// The text a guest could read on a page (body text plus placeholder/label/alt values), minus anything under data-module.
function visibleCopy(html, keep) {
  const s = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '');
  const body = s.slice(s.indexOf('<body'));
  const VOID = /^(img|input|br|hr|meta|link|source)$/i;
  let out = '', last = 0, skip = null;
  for (const m of body.matchAll(/<(\/?)([a-z][\w-]*)\b([^>]*)>/gi)) {
    const [tag, close, name, attrs] = m;
    if (!skip) out += body.slice(last, m.index);
    last = m.index + tag.length;
    if (skip) {
      if (name === skip.name) skip.depth += close ? -1 : VOID.test(name) ? 0 : 1;
      if (skip.depth === 0) skip = null;
      continue;
    }
    const gate = attrs.match(/\bdata-module="([^"]*)"/);
    if (!close && gate && !gate[1].split(/\s+/).some((g) => keep.includes(g))) { if (!VOID.test(name)) skip = { name, depth: 1 }; continue; }
    out += ' ' + [...attrs.matchAll(/\b(?:placeholder|aria-label|title|alt)="([^"]*)"/g)].map((a) => a[1]).join(' ') + ' ';
  }
  return out;
}

test('module-specific copy only appears in markup gated by its module', () => {
  const fields = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fields.json'), 'utf8'));
  const ids = fields.modules.map((m) => m.id);
  for (const k of Object.keys(VOCAB)) assert.ok(ids.includes(k), `${k} is not a module in fields.json`);
  const app = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');
  const pageModule = JSON.parse(app.match(/PAGE_MODULE = (\{[^}]*\})/)[1].replace(/'/g, '"'));
  for (const p of pages.filter((f) => !['admin.html', 'sms.html'].includes(f))) {
    // A page that belongs to a module may talk about it freely; everything else must be gated.
    const own = pageModule[p];
    const text = visibleCopy(fs.readFileSync(path.join(dir, p), 'utf8'), own ? [own] : []);
    for (const [mod, re] of Object.entries(VOCAB)) {
      if (mod === own) continue;
      const hit = text.match(re);
      assert.ok(!hit, `${p}: "${hit && hit[0]}" is ${mod} copy outside an element with data-module="${mod}"`);
    }
  }
});

test('data-module names are real modules', () => {
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fields.json'), 'utf8')).modules.map((m) => m.id);
  for (const p of pages) {
    for (const [, v] of fs.readFileSync(path.join(dir, p), 'utf8').matchAll(/\bdata-module="([^"]*)"/g)) {
      for (const m of v.split(/\s+/)) assert.ok(ids.includes(m), `${p}: data-module="${m}"`);
    }
  }
});

test('App.prune drops elements whose module is off and keeps the rest (no features list = all on)', () => {
  const removed = [];
  const els = ['stay', 'stay rooms', 'menu'].map((m) => ({ dataset: { module: m }, remove() { removed.push(m); } }));
  const ctx = { location: { search: '', hostname: 'x', origin: '', pathname: '/' }, localStorage: { getItem: () => null, setItem() {} },
    fetch: () => new Promise(() => {}), document: { querySelectorAll: () => els }, URLSearchParams, Intl, Date, encodeURIComponent };
  const App = require('node:vm').runInNewContext(fs.readFileSync(path.join(dir, 'app.js'), 'utf8') + '; App', ctx);
  App.prune({});
  assert.deepStrictEqual(removed, []);
  App.prune({ features: ['menu'] });
  assert.deepStrictEqual(removed, ['stay', 'stay rooms']);
});

// A built app drops the pages its event doesn't use (scripts/new-event.js), so page-specific checks run only where the page exists.
const has = (f) => pages.includes(f);

test('menu "add a dish" opens a dialog with only ideas and a free-text field', { skip: !has('menu.html') }, () => {
  const html = fs.readFileSync(path.join(dir, 'menu.html'), 'utf8');
  assert.match(html, /<dialog id="addDlg" aria-labelledby="addTitle">/);
  assert.match(html, /<input type="hidden" id="slot"/); // the clicked button already chose the slot
  assert.doesNotMatch(html, /<select id="slot"|scrollIntoView/);
  assert.match(html, /dlg\.showModal\(\)/);
  assert.match(html, /data-close/);
  assert.match(css, /dialog::backdrop/);
});

test('details "add a game" opens a dialog wired to addActivity/removeActivity', () => {
  const html = fs.readFileSync(path.join(dir, 'details.html'), 'utf8');
  assert.match(html, /<dialog id="gameDlg"/);
  assert.match(html, /gameDlg|dlg\.showModal\(\)/);
  assert.match(html, /api\('addActivity'/);
  assert.match(html, /api\('removeActivity'/);
});

test('add-item dialogs: no padding-click close, no double submit, inline errors', () => {
  for (const [file, err] of [['menu.html', 'addErr'], ['details.html', 'gameErr']]) {
    if (!has(file)) continue;
    const html = fs.readFileSync(path.join(dir, file), 'utf8');
    assert.doesNotMatch(html, /e\.target === dlg/, file); // padding clicks also have target === dlg
    assert.match(html, /getBoundingClientRect\(\)/, file);
    assert.match(html, new RegExp(`id="${err}" role="alert" hidden`), file);
    assert.match(html, /go\.disabled = true[\s\S]*finally \{ go\.disabled = false; \}/, file);
  }
  if (has('menu.html')) assert.match(fs.readFileSync(path.join(dir, 'menu.html'), 'utf8'), /try \{\s*await App\.api\('removeFood'/);
});

test('page hook contract: derived from the pages, and a redesign that drops a hook is caught', { skip: !['house', 'menu', 'guests', 'trips'].every((n) => has(n + '.html')) }, () => {
  const { contract, missing } = require('./page-hooks.js');
  const want = contract(dir);
  assert.deepStrictEqual(Object.keys(want).sort(), pages.filter((p) => !['admin.html', 'sms.html'].includes(p)).sort());
  assert.ok(want['rsvp.html'].ids.includes('form') && want['rsvp.html'].names.includes('status'));
  assert.ok(want['menu.html'].ids.includes('addDlg') && want['menu.html'].calls.includes('api'));
  assert.deepStrictEqual(missing(want, dir), []);

  const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'hooks-'));
  for (const p of pages) fs.writeFileSync(path.join(tmp, p), fs.readFileSync(path.join(dir, p), 'utf8'));
  const rsvp = fs.readFileSync(path.join(tmp, 'rsvp.html'), 'utf8');
  fs.writeFileSync(path.join(tmp, 'rsvp.html'), rsvp.replace('id="form"', 'id="f"').replace(/name="status"/g, 'name="s"'));
  const gone = missing(want, tmp).join('\n');
  assert.match(gone, /rsvp\.html: id form/);
  assert.match(gone, /rsvp\.html: form field name status/);
  fs.rmSync(path.join(tmp, 'menu.html'));
  assert.match(missing(want, tmp).join('\n'), /menu\.html: page is missing/);

  // hooks found through helper calls, app.js's own hooks, and the radio values the API receives
  assert.ok(want['index.html'].ids.includes('hero-img') && want['index.html'].ids.includes('nav'));
  assert.ok(want['rsvp.html'].radios.includes('status=maybe') && want['rsvp.html'].radios.includes('sleep=request_room'));
  const edit = (page, f) => {
    const t2 = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'hooks-'));
    for (const p of pages) fs.writeFileSync(path.join(t2, p), fs.readFileSync(path.join(dir, p), 'utf8'));
    fs.writeFileSync(path.join(t2, page), f(fs.readFileSync(path.join(t2, page), 'utf8')));
    return missing(want, t2).join('\n');
  };
  assert.match(edit('index.html', (h) => h.replace('id="hero-img"', 'id="h"')), /index\.html: id hero-img/);
  assert.match(edit('index.html', (h) => h.replace('id="nav"', 'id="n"')), /index\.html: id nav/);
  assert.match(edit('rsvp.html', (h) => h.replace('value="request_room"', 'value="room"')), /rsvp\.html: radio option sleep=request_room/);
});

const guestPages = pages.filter((f) => !['admin.html', 'sms.html'].includes(f));
const pageStyles = (html) => [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');

test('every guest page keeps the full nav: never hidden by page CSS or styles.css', () => {
  const hides = (c) => [...c.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]*)\{([^{}]*)\}/g)]
    .filter(([, sel, body]) => /#nav\b/.test(sel) && /display\s*:\s*none|visibility\s*:\s*hidden/.test(body)).map(([, sel]) => sel.trim());
  assert.deepStrictEqual(hides(css), [], 'styles.css hides the nav');
  for (const p of guestPages) {
    const html = fs.readFileSync(path.join(dir, p), 'utf8');
    assert.deepStrictEqual(hides(pageStyles(html)), [], `${p}: page CSS hides the nav`);
    assert.match(html, /<nav\b[^>]*id="nav"/, `${p}: needs <nav id="nav">`);
    assert.doesNotMatch(html, /<nav\b[^>]*\shidden\b|<nav\b[^>]*>(?:(?!<\/nav>)[\s\S])*?<a\b[^>]*\shidden\b/, `${p}: nav or a nav link has the hidden attribute`);
  }
});

test('at phone width the nav wraps onto its own full-width row instead of scrolling sideways', () => {
  const narrow = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/@media \(max-width: 560px\) \{([\s\S]*?)\n\}/)[1];
  const rule = (sel) => (narrow.match(new RegExp(`(?:^|\\n)\\s*${sel.replace(/[.#]/g, '\\$&')}\\s*\\{([^}]*)\\}`)) || [])[1] || '';
  assert.match(rule('header.site .inner'), /flex-wrap\s*:\s*wrap/, 'header must wrap at 560px');
  assert.match(rule('#nav'), /flex\s*:\s*1 1 100%/, '#nav needs its own row');
  assert.match(rule('#nav'), /flex-wrap\s*:\s*wrap/);
  assert.match(rule('#nav'), /overflow\s*:\s*visible/, 'no sideways scroll at phone width');
});

test('the nav links to every guest page, each gated by its module', () => {
  const src = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');
  const items = [...src.match(/const items = (\[[\s\S]*?\]\]);/)[1].matchAll(/\['([a-z]+\.html)'/g)].map((m) => m[1]);
  for (const p of guestPages) assert.ok(items.includes(p), `app.js nav() has no link for ${p}`);
  assert.match(src, /PAGE_MODULE\[href\]/, 'nav() must filter by PAGE_MODULE');
  const inline = fs.readFileSync(path.join(dir, 'index.html'), 'utf8').match(/<nav id="nav">([\s\S]*?)<\/nav>/);
  if (inline) for (const p of guestPages) assert.ok(inline[1].includes(`href="${p}"`), `index.html static nav lacks ${p}`);
});

test('index: an answered guest sees the status card, not the quick form', { skip: !has('index.html') }, () => {
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const fn = html.match(/function showStatus\(g\) \{([\s\S]*?)\n    \}\n/);
  assert.ok(fn, 'index.html needs showStatus(g)');
  assert.match(fn[1], /yes:[\s\S]*maybe:[\s\S]*no:/, 'labels for yes, maybe and no');
  assert.match(fn[1], /closest\('\.reply-col'\)\.hidden = answered/, 'hides the quick form once answered');
  assert.match(fn[1], /Change RSVP/, 'status card links to change the answer');
  assert.match(fn[1], /App\.link\('rsvp\.html'\)/);
  assert.doesNotMatch(fn[1], /invited/, 'invited guests keep the form');
  assert.match(html, /Object\.assign\(me, out\);\s*showStatus\(me\.guest\)/, 'submit switches to the status view');
});
