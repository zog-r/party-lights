// The markup contract between a guest page and the code behind it. A redesign may change layout, copy and styling freely
// as long as every hook the page's script (or app.js) reaches for is still there. Derived from the template pages, never hand-listed.
//   hooks(html)                   -> { ids, classes, attrs, names, radios, calls } a page must keep
//   contract(siteDir)             -> { 'rsvp.html': hooks, ... } for every guest page in a site folder
//   missing(contract, siteDir)    -> ['rsvp.html: id #form', ...] hooks a (redesigned) site no longer has
//   pagesFor(event, siteDir)      -> guest pages this event's modules turn on
//   snapshot(appDir)              -> writes .party-lights/hooks.json once, before any redesign; check() then judges against it,
//                                    so a plugin upgrade that adds hooks never fails an app that was designed under the old ones
const fs = require('node:fs');
const path = require('node:path');

const NOT_GUEST_PAGES = ['admin.html', 'sms.html'];
const scriptsOf = (html) => [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
const markupOf = (html) => html.replace(/<script\b[\s\S]*?<\/script>/g, '');
// What app.js itself reaches for on every page: boot() fills a.brand and falls back to <main>, nav() fills #nav.
const APP = { ids: ['nav'], classes: ['brand'], tags: ['main'] };
const uniq = (a) => [...new Set(a)].sort();

// What a page's markup offers: every id, class, data- attribute and form-control name present.
function present(html) {
  const markup = markupOf(html);
  const all = (re, f = (m) => m[1]) => new Set([...markup.matchAll(re)].flatMap((m) => [].concat(f(m))));
  return {
    ids: all(/\bid="([^"]+)"/g),
    classes: all(/\bclass="([^"]+)"/g, (m) => m[1].split(/\s+/)),
    attrs: all(/\s(data-[\w-]+)/g),
    names: all(/<(?:input|select|textarea|button)\b[^>]*>/g, (m) => [...m[0].matchAll(/\bname="([^"]+)"/g)].map((n) => n[1])),
    // name=value of every radio: the API receives those values, so a redesign must still offer each one.
    radios: all(/<input\b[^>]*\btype="radio"[^>]*>/g, (m) => {
      const name = /\bname="([^"]+)"/.exec(m[0]), value = /\bvalue="([^"]*)"/.exec(m[0]);
      return name && value ? [`${name[1]}=${value[1]}`] : [];
    }),
    tags: new Set(APP.tags.filter((t) => new RegExp(`<${t}\\b`).test(markup))),
  };
}

function hooks(html) {
  const has = present(html);
  const js = scriptsOf(html);
  // What the scripts reach for: the string argument of any call (selectors, getElementById, helpers like text('fineAsk') or
  // img('hero-img', ...)). Strings that are not ids or classes the page has are dropped below.
  const sel = [...js.matchAll(/[\w$]+\(\s*(['"`])((?:(?!\1).)*)\1/g)].map((m) => m[2]);
  const ids = sel.flatMap((s) => [...s.matchAll(/#([\w-]+)/g)].map((m) => m[1]).concat(/^[\w-]+$/.test(s) ? [s] : []));
  const classes = sel.flatMap((s) => [...s.matchAll(/\.([\w-]+)/g)].map((m) => m[1]));
  return {
    ids: uniq([...ids.filter((i) => has.ids.has(i)), ...APP.ids]),
    classes: uniq([...classes.filter((c) => has.classes.has(c)), ...APP.classes]),
    tags: APP.tags,
    attrs: uniq(has.attrs),
    names: uniq(has.names),
    radios: uniq(has.radios),
    calls: uniq([...js.matchAll(/\bApp\.(\w+)/g)].map((m) => m[1])),
  };
}

const guestPages = (siteDir) => fs.readdirSync(siteDir).filter((f) => f.endsWith('.html') && !NOT_GUEST_PAGES.includes(f)).sort();

function contract(siteDir) {
  const out = {};
  for (const p of guestPages(siteDir)) out[p] = hooks(fs.readFileSync(path.join(siteDir, p), 'utf8'));
  return out;
}

function missing(want, siteDir) {
  const gone = [];
  for (const [page, h] of Object.entries(want)) {
    const file = path.join(siteDir, page);
    if (!fs.existsSync(file)) { gone.push(`${page}: page is missing`); continue; }
    const html = fs.readFileSync(file, 'utf8');
    const has = present(html);
    const calls = new Set(hooks(html).calls);
    for (const [kind, list, set] of [['id', h.ids, has.ids], ['class', h.classes, has.classes], ['attribute', h.attrs, has.attrs],
      ['form field name', h.names, has.names], ['radio option', h.radios || [], has.radios], ['element', h.tags || [], has.tags], ['App call', h.calls, calls]]) {
      for (const v of list) if (!set.has(v)) gone.push(`${page}: ${kind} ${v}`);
    }
    for (const need of [/src="app\.js"/, /href="styles\.css"/]) if (!need.test(html)) gone.push(`${page}: lost ${need.source}`);
  }
  return gone;
}

// Same rule app.js uses: an event with no `features` list shows every module page.
function pagesFor(ev, siteDir) {
  let pm;
  try {
    pm = JSON.parse(fs.readFileSync(path.join(siteDir, 'app.js'), 'utf8').match(/PAGE_MODULE = (\{[^}]*\})/)[1].replace(/'/g, '"'));
  } catch {
    throw new Error(`Could not read which pages belong to which module from ${path.join(siteDir, 'app.js')} (the PAGE_MODULE line).`);
  }
  const on = (m) => !ev.features || ev.features.includes(m);
  return guestPages(siteDir).filter((p) => !pm[p] || on(pm[p]));
}

const TEMPLATE = path.join(__dirname, '../site');
const snapFile = (appDir) => path.join(appDir, '.party-lights/hooks.json');

function snapshot(appDir) {
  if (fs.existsSync(snapFile(appDir)) || !fs.existsSync(path.join(appDir, 'site'))) return;
  fs.mkdirSync(path.dirname(snapFile(appDir)), { recursive: true });
  fs.writeFileSync(snapFile(appDir), JSON.stringify(contract(TEMPLATE), null, 2) + '\n');
}

// What a redesigned app at appDir dropped, checked only on the pages its event turns on.
function check(appDir) {
  const tpl = TEMPLATE;
  const evFile = path.join(appDir, 'site/event.json');
  const ev = fs.existsSync(evFile) ? JSON.parse(fs.readFileSync(evFile, 'utf8')) : {};
  let all;
  try { all = JSON.parse(fs.readFileSync(snapFile(appDir), 'utf8')); } catch { all = contract(tpl); }
  const want = Object.fromEntries(pagesFor(ev, tpl).filter((p) => all[p]).map((p) => [p, all[p]]));
  return missing(want, path.join(appDir, 'site'));
}

// The confirmation email can only carry the file images.hero.src points at. A redesign that draws its hero in CSS or
// video leaves the template's placeholder there, and the email ships a picture the invite never shows (seen live).
function heroUnchanged(appDir) {
  const evFile = path.join(appDir, 'site/event.json');
  const src = fs.existsSync(evFile) ? JSON.parse(fs.readFileSync(evFile, 'utf8')).images?.hero?.src : '';
  const mine = src && path.join(appDir, 'site', src);
  const stock = src && path.join(__dirname, '../site', src);
  if (!mine || !fs.existsSync(mine) || !fs.existsSync(stock) || !fs.readFileSync(mine).equals(fs.readFileSync(stock))) return [];
  return [`${src} is still the starter placeholder: the emails will show it. Replace it with a picture of the new hero (screenshot it), or the host's photo.`];
}

module.exports = { hooks, contract, missing, pagesFor, snapshot, check, heroUnchanged };
