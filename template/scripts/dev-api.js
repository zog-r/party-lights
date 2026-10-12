// Local stand-in for the Apps Script web app: runs the real gas/*.js against an in-memory Sheet.
// `node scripts/dev-api.js` → POST http://localhost:8787 (seeded guests: test1 yes, test2 invited, test3 maybe; admin key "dev").
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const crypto = require('node:crypto');

function fakeSheet(name) {
  const data = [];
  const width = () => Math.max(0, ...data.map((r) => r.length));
  const pad = () => data.forEach((r) => { while (r.length < width()) r.push(''); });
  const range = (row, col, nr = 1, nc = 1) => ({
    setValues(v) { v.forEach((r, i) => r.forEach((x, j) => { (data[row - 1 + i] ||= [])[col - 1 + j] = x; })); pad(); return this; },
    setValue(x) { return this.setValues([[x]]); },
    getValues() { return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => data[row - 1 + i]?.[col - 1 + j] ?? '')); },
    setFontWeight() { return this; },
    insertCheckboxes() { return this; },
    setFontColor() { return this; },
    setBackground() { return this; },
    clearDataValidations() { return this; },
  });
  return {
    name,
    getDataRange: () => ({ getValues: () => data.map((r) => [...r]) }),
    getRange: (a, b, c, d) => (typeof a === 'string' ? range(1, 1) : range(a, b, c, d)),
    appendRow(r) { data.push([...r]); pad(); },
    deleteRow(i) { data.splice(i - 1, 1); },
    setFrozenRows() {},
    setColumnWidth() {},
    clear() { data.length = 0; },
    getMaxRows: () => Math.max(1, data.length),
    getMaxColumns: () => Math.max(1, width()),
    getLastRow: () => data.length,
    getLastColumn: () => width(),
  };
}

// `event` (optional) replaces the baked site/event.json, so tests can run against a fixed event.
function makeContext(event) {
  const sheets = {};
  const outbox = [];
  const ctx = {
    console,
    selection: null,
    SpreadsheetApp: {
      getActiveRange: () => {
        const sh = sheets.Guests;
        const { row = 1, rows = sh.getLastRow() } = ctx.selection || {};
        return { getRow: () => row, getNumRows: () => rows };
      },
      getActive: () => ({
        getSheetByName: (n) => sheets[n] || null,
        insertSheet: (n) => (sheets[n] = fakeSheet(n)),
        toast: (m) => console.log('[toast]', m),
      }),
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      base64Decode: (b64) => [...Buffer.from(b64, 'base64')],
      newBlob: (bytes, type, name) => ({ bytes, type, name }),
      formatDate: (d, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ setMimeType: () => ({ body: s }) }) },
    MailApp: { sendEmail: (...a) => { outbox.push(a); console.log('[mail]', typeof a[0] === 'string' ? a[0] + ' | ' + a[1] : a[0].to + ' | ' + a[0].subject); } },
    UrlFetchApp: { fetch: (url, o) => { console.log('[push]', url, o.payload); return { getResponseCode: () => 200 }; } },
    // The local dev server and tests act as the signed-in host; tests swap this for an anonymous visitor.
    Session: { getEffectiveUser: () => ({ getEmail: () => 'host@example.com' }), getActiveUser: () => ({ getEmail: () => 'host@example.com' }) },
    ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: () => { const b = { create: () => ({}) }; for (const k of ['timeBased', 'atHour', 'everyDays', 'everyMinutes', 'inTimezone']) b[k] = () => b; return b; }, getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TEST/exec' }) },
    HtmlService: {
      createHtmlOutputFromFile: (name) => ({ getContent: () => fs.readFileSync(path.join(__dirname, '..', 'gas', name + '.html'), 'utf8') }),
      createHtmlOutput: (html) => {
        const out = { html, title: '', meta: {}, setTitle(t) { out.title = t; return out; }, addMetaTag(k, v) { out.meta[k] = v; return out; } };
        return out;
      },
    },
  };
  vm.createContext(ctx);
  const dir = path.join(__dirname, '..', 'gas');
  if (event) {
    const { fillDerived, bake } = require('./gen-event.js');
    vm.runInContext(`const EVENT = ${JSON.stringify(bake(fillDerived(structuredClone(event))))};`, ctx, { filename: 'event.gen.js' });
  }
  for (const f of [...(event ? [] : ['event.gen.js']), 'pages.gen.js', 'hero.gen.js', 'logic.js', 'Code.js', 'admin.js']) {
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
  }
  ctx.outbox = outbox;
  return ctx;
}

function seed(ctx) {
  vm.runInContext(`
    setup();
    const set = (k, v) => { const r = rows_('Settings').find((x) => x.key === k); updateRow_('Settings', r._row, { value: v }); };
    set('admin_key', 'dev');
    set('site_url', 'http://localhost:5173');
    set('address', '123 Example Lane, Somewhere, CA');
    set('directions', 'Park on the left. Gate code 0000.');
    appendRow_('Guests', { token: 'test1', name: 'Alex Tester', email: 'alex@example.com', phone: '5550001111', status: 'yes', adults: 2, kids: 1, remind_email: true });
    appendRow_('Guests', { token: 'test2', name: 'Blair Sample', email: 'blair@example.com', phone: '5550002222', status: 'invited' });
    appendRow_('Guests', { token: 'test3', name: 'Casey Demo', email: '', phone: '5550003333', status: 'maybe', adults: 1, remind_text: true });
    if (modOn_('menu') && EVENT.food_slots.length) {
      appendRow_('Food', { id: 'f1', token: 'test1', slot: EVENT.food_slots[0].id, item: 'Prime rib', created_at: now_() });
      appendRow_('Food', { id: 'f2', token: 'test3', slot: EVENT.food_slots.at(-1).id, item: 'Hot cocoa', created_at: now_() });
    }
  `, ctx);
}

function call(ctx, body) {
  return JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).body);
}

module.exports = { makeContext, seed, call };

if (require.main === module) {
  const ctx = makeContext();
  seed(ctx);
  const port = Number(process.env.PORT || 8787);
  http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    // GET /exec?page=rsvp&t=test1 previews the pages exactly as Apps Script serves them, with google.script.run shimmed to POST here.
    if (req.method === 'GET' && req.url.startsWith('/exec')) {
      ctx.ScriptApp.getService = () => ({ getUrl: () => `http://localhost:${port}/exec` });
      const out = ctx.doGet({ parameter: Object.fromEntries(new URL(req.url, 'http://x').searchParams) });
      if (!out.html) { res.setHeader('Content-Type', 'application/json'); return res.end(out.body); }
      const shim = `<script>window.google={script:{run:(function mk(ok,fail){return{withSuccessHandler:(f)=>mk(f,fail),withFailureHandler:(f)=>mk(ok,f),
        api:(j)=>fetch('/',{method:'POST',body:j}).then((r)=>r.json()).then(ok,fail)}})()}};</script>`;
      res.setHeader('Content-Type', 'text/html');
      return res.end(`<!doctype html><title>${out.title}</title>` + shim + out.html);
    }
    if (req.method !== 'POST') return res.end(JSON.stringify({ ok: true }));
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const out = ctx.doPost({ postData: { contents: body } }).body;
      res.setHeader('Content-Type', 'application/json');
      res.end(out);
    });
  }).listen(port, () => console.log(`dev API on http://localhost:${port}`));
}
