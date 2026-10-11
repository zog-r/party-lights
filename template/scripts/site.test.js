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
  for (const p of ['index.html', 'house.html']) assert.doesNotMatch(fs.readFileSync(path.join(dir, p), 'utf8'), /--pine:|--linen:/, p);
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
