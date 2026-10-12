// The Apps Script pages generated from site/, and site/app.js running inside one.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { build, emailTheme } = require('./build-gas-site.js');

const root = path.join(__dirname, '..');
const gas = path.join(root, 'gas');
const siteFiles = fs.readdirSync(path.join(root, 'site')).filter((f) => f.endsWith('.html'));

test('every site page is generated, self-contained, with event data and data: URIs', () => {
  build(root);
  assert.ok(siteFiles.length > 0);
  for (const f of siteFiles) {
    const html = fs.readFileSync(path.join(gas, 'page_' + f), 'utf8');
    assert.doesNotMatch(html, /assets\//, f);
    assert.doesNotMatch(html, /href="styles\.css"|src="app\.js"/, f);
    assert.match(html, /window\.EVENT_DATA = \{/, f);
    assert.match(html, /<style>/, f);
    assert.match(html, /href="data:image\/svg\+xml;base64,/, 'favicon ' + f);
  }
  const names = vm.runInNewContext(fs.readFileSync(path.join(gas, 'pages.gen.js'), 'utf8') + '; JSON.stringify(PAGES)');
  assert.deepEqual(JSON.parse(names).sort(), siteFiles.map((f) => f.replace('.html', '')).sort());
  assert.match(fs.readFileSync(path.join(gas, 'hero.gen.js'), 'utf8'), /^var HERO_B64 = '[A-Za-z0-9+/=]*';$/m);
});

test('no inline script has a // that Apps Script would strip, and every script still parses', () => {
  build(root);
  const AsyncFunction = (async () => {}).constructor;
  for (const f of siteFiles) {
    const html = fs.readFileSync(path.join(gas, 'page_' + f), 'utf8');
    for (const [, body] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
      // Live, Apps Script cut 'https://maps…' to 'https: and the details page died. Only comment-style // may remain.
      for (const line of body.split('\n')) assert.doesNotMatch(line.replace(/(^|\s)\/\/.*$/, ''), /\/\//, `${f}: ${line.trim().slice(0, 80)}`);
      assert.doesNotThrow(() => new AsyncFunction(body), f);
    }
  }
});

test('a second build rewrites nothing', () => {
  build(root);
  const stamp = () => fs.readdirSync(gas).filter((f) => /^page_|\.gen\.js$/.test(f)).map((f) => fs.statSync(path.join(gas, f)).mtimeMs);
  const before = stamp();
  build(root);
  assert.deepEqual(stamp(), before);
});

test('the generated files are gitignored in the app', () => {
  const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  for (const p of ['gas/page_*.html', 'gas/pages.gen.js', 'gas/hero.gen.js']) assert.ok(ignore.includes(p), p);
});

function appInGas(params, run) {
  const calls = [];
  const ctx = {
    location: { search: '', hostname: 'x', origin: 'https://x', pathname: '/' },
    localStorage: { getItem: () => null, setItem() {} },
    document: { querySelectorAll: () => [], querySelector: () => null },
    URLSearchParams, Intl, Date, encodeURIComponent, Promise, Object, JSON, String,
    fetch: () => { throw new Error('GAS mode must not fetch'); },
  };
  ctx.window = ctx;
  ctx.GAS = { base: 'https://script.google.com/macros/s/TEST/exec', params };
  ctx.EVENT_DATA = { title: 'T', brand: 'T' };
  ctx.google = { script: { run: {
    withSuccessHandler(ok) { this.ok = ok; return this; },
    withFailureHandler(fail) { this.fail = fail; return this; },
    api(json) { calls.push(JSON.parse(json)); const out = ctx.reply(JSON.parse(json)); setTimeout(() => (out instanceof Error ? this.fail(out) : this.ok(out))); },
  } } };
  vm.createContext(ctx);
  const App = vm.runInContext(fs.readFileSync(path.join(root, 'site/app.js'), 'utf8') + '; App', ctx);
  return run(App, ctx, calls);
}

test('app.js under Apps Script: link() makes ?page= URLs and keeps the token', () => appInGas({ page: 'rsvp', t: 'tok 1' }, (App) => {
  assert.equal(App.link('rsvp.html'), 'https://script.google.com/macros/s/TEST/exec?page=rsvp&t=tok%201');
  assert.equal(App.link('index.html'), 'https://script.google.com/macros/s/TEST/exec?page=index&t=tok%201');
  assert.equal(App.link('https://elsewhere.test/x'), 'https://elsewhere.test/x');
  assert.equal(App.token, 'tok 1');
}));

test('app.js under Apps Script: no token means no t=', () => appInGas({}, (App) => {
  assert.equal(App.link('details.html'), 'https://script.google.com/macros/s/TEST/exec?page=details');
}));

test('app.js under Apps Script: event() is the inlined data and api() round-trips', () => appInGas({ t: 'tok' }, async (App, ctx, calls) => {
  assert.equal((await App.event()).title, 'T');
  ctx.reply = (req) => ({ ok: true, data: { echoed: req.action } });
  assert.deepEqual({ ...(await App.api('me')) }, { echoed: 'me' });
  assert.deepEqual({ ...calls[0] }, { action: 'me', token: 'tok' });
  ctx.reply = () => ({ ok: false, error: 'bad_token' });
  await assert.rejects(App.api('me'), (e) => e.code === 'bad_token' && e.message === 'bad_token');
  ctx.reply = () => new Error('Script died');
  await assert.rejects(App.api('me'), /Script died/);
}));

test('app.js under Apps Script: fragment links stay in the iframe and scroll to their target', async () => {
  let ctxRef;
  await appInGas({}, async (App, ctx) => {
    const attrs = {};
    let click;
    let scrolled = 0;
    const a = { getAttribute: (k) => (k === 'href' ? '#reply' : null), setAttribute: (k, v) => (attrs[k] = v), addEventListener: (_, f) => (click = f) };
    ctx.document.querySelectorAll = (sel) => (sel === 'a[href^="#"]' ? [a] : []);
    ctx.document.getElementById = (id) => (id === 'reply' ? { scrollIntoView: () => scrolled++ } : null);
    await App.boot({ gate: false });
    assert.equal(attrs.target, '_self');
    let prevented = false;
    click({ preventDefault: () => (prevented = true) });
    assert.ok(prevented && scrolled === 1);
    ctxRef = ctx;
  });
  assert.ok(ctxRef);
});

test('emailTheme reads the site palette through var(), and falls back for an unreadable stylesheet', () => {
  const css = `:root { --night: #0b1524; --snow: #eef5fb; --amber: #ffbd59; --display: 'Bricolage Grotesque', Georgia, sans-serif; }
    body { background: var(--night); color: var(--snow); }
    .btn.primary { background: var(--amber); border-color: var(--amber); color: #1d1204; }`;
  const t = emailTheme(css);
  assert.deepEqual([t.bg, t.ink, t.accent, t.onAccent], ['#0b1524', '#eef5fb', '#ffbd59', '#1d1204']);
  assert.match(t.display, /^'Bricolage Grotesque'/);
  const bare = emailTheme('p { margin: 0 }');
  assert.match(bare.bg, /^#[0-9a-f]{6}$/i);
  assert.match(bare.accent, /^#[0-9a-f]{6}$/i);
});

const lumaOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).reduce((n, v, i) => n + v * [0.299, 0.587, 0.114][i], 0);
const assertReadable = (t) => {
  for (const k of ['bg', 'ink', 'accent', 'onAccent', 'card', 'muted', 'hair']) assert.match(t[k], /^#[0-9a-f]{6}$/i, k);
  assert.ok(Math.abs(lumaOf(t.bg) - lumaOf(t.ink)) >= 100, 'bg/ink contrast');
  assert.ok(Math.abs(lumaOf(t.accent) - lumaOf(t.onAccent)) >= 100, 'accent/onAccent contrast');
  assert.ok(!t.display.includes('var(') && !t.body.includes('var('));
};

test('emailTheme: background-color, minified last declaration, comments, rgb()', () => {
  const t = emailTheme(`/* :root { --a: #ffffff } */:root{--n:rgb(11, 21, 36);--s:#eef;--display:Georgia,serif}body{background-color:var(--n);color:var(--s)}`);
  assert.deepEqual([t.bg, t.ink, t.display], ['#0b1524', '#eeeeff', 'Georgia,serif']);
  assertReadable(t);
});

test('emailTheme: dark-mode :root inside @media does not override the base palette', () => {
  const t = emailTheme(`:root{--bg:#0b1524;--fg:#eef5fb}body{background:var(--bg);color:var(--fg)}
    @media (prefers-color-scheme: light) { :root{--bg:#ffffff;--fg:#eef5fb} }`);
  assert.equal(t.bg, '#0b1524');
  assertReadable(t);
});

test('emailTheme: var() fallbacks and nested vars resolve; unresolved fonts use the default', () => {
  const t = emailTheme(`:root{--a:var(--b);--b:#102030;--display:var(--missing)}
    body{background:var(--a);color:var(--nope, #f0f0f0)}.btn.primary{background:var(--x, #ffcc00);color:#000}`);
  assert.deepEqual([t.bg, t.ink, t.accent, t.onAccent], ['#102030', '#f0f0f0', '#ffcc00', '#000000']);
  assert.match(t.display, /Fraunces/);
  assertReadable(t);
});

test('emailTheme: an unresolvable or low-contrast bg/ink pair falls back to the default pair as a pair', () => {
  const dflt = emailTheme('');
  for (const css of [
    'body{background:#303030;color:#383838}',
    'body{background:linear-gradient(#000,#fff);color:#ffffff}',
    'body{background:var(--gone);color:#ffffff}',
  ]) {
    const t = emailTheme(css);
    assert.deepEqual([t.bg, t.ink], [dflt.bg, dflt.ink], css);
    assertReadable(t);
  }
  assertReadable(emailTheme('.btn.primary{background:#fff;color:#fefefe}'));
});

test('hero.gen.js carries the theme from the real stylesheet and the hero mime', () => {
  build(root);
  const code = fs.readFileSync(path.join(gas, 'hero.gen.js'), 'utf8');
  const g = vm.runInNewContext(code + '; ({ EMAIL_THEME, HERO_MIME })');
  assert.match(g.HERO_MIME, /^image\//);
  const t = g.EMAIL_THEME;
  assert.deepEqual([t.bg, t.ink, t.accent, t.onAccent], ['#0f2523', '#f6f0e6', '#f2b25c', '#1b140a']);
  assert.equal(t.display, "'Fraunces', Georgia, serif");
  assert.equal(t.body, "'Instrument Sans', system-ui, sans-serif");
  assertReadable(t);
});
