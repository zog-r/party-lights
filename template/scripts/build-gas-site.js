// Turns site/ into pages Apps Script can serve: gas/page_<name>.html with the stylesheet, app.js, event data and every
// assets/ file inlined (an Apps Script web app has no static file hosting). Also writes gas/pages.gen.js (the page
// whitelist for doGet) and gas/hero.gen.js (the hero image for the confirmation email). All generated, all gitignored.
const fs = require('node:fs');
const path = require('node:path');

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', mp4: 'video/mp4' };
const LIMIT = 1024 * 1024;

const write = (file, text) => { if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) fs.writeFileSync(file, text); };
// Inline JS/JSON must not be able to close its own <script> tag.
const safe = (s) => s.replace(/<\//g, '<\\/');
// Apps Script's page loader strips `//` "comments" naively, cutting strings like 'https://…' short (seen live: the
// details page died with "Invalid or unexpected token"). Escape every `//` glued to a word, quote, `:` or `-`
// (URLs, base64, PRODID) as `\/\/`, which means the same inside strings, templates and regexes. Real comments
// follow whitespace or a line start and are left alone.
const noSlashes = (s) => s.replace(/([\w'"`:+=-])(\/{2,})/g, (m, c, run) => c + '\\/'.repeat(run.length));
const scriptsSafe = (html) => html.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/g, (m, a, body, b) => a + noSlashes(body) + b);

// Email clients ignore stylesheets, so the emails get the site's palette as plain values: body background/text, the
// primary button, the display/body fonts, read from styles.css (:root tokens, resolved through var()). Anything that
// can't be read falls back to the Dusk defaults, so a hand-built stylesheet never breaks the build.
const DEFAULT_THEME = { bg: '#0f2523', card: '#143029', ink: '#f6f0e6', muted: '#a9b9b4', hair: '#2a3f3a', accent: '#f2b25c',
  onAccent: '#0f2523', display: "Fraunces,Georgia,'Times New Roman',serif", body: "'Instrument Sans',Helvetica,Arial,sans-serif" };
const MIN_CONTRAST = 100;
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const rgb = (h) => { const x = h.length === 4 ? h.replace(/[^#]/g, '$&$&').slice(1) : h.slice(1); return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)); };
const mix = (a, b, t) => '#' + rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
const luma = (h) => { const [r, g, b] = rgb(h); return 0.299 * r + 0.587 * g + 0.114 * b; };

// Drops @media/@supports/... blocks so a dark-mode :root override can't win over the base palette.
function withoutAtBlocks(css) {
  let out = '';
  for (let i = 0; i < css.length;) {
    const semi = css.indexOf(';', i);
    const brace = css.indexOf('{', i);
    if (css[i] === '@' && brace >= 0 && (semi < 0 || brace < semi)) {
      let depth = 0;
      let j = brace;
      for (; j < css.length; j++) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}' && --depth === 0) break;
      }
      i = j + 1;
    } else out += css[i++];
  }
  return out;
}

const decls = (body) => [...body.matchAll(/([\w-]+)\s*:\s*([^;]+)/g)].map((m) => [m[1], m[2].trim()]);
// #rgb, #rrggbb and rgb(r g b) / rgb(r, g, b) become #rrggbb; anything else (gradients, names, alpha) is null.
function toHex(v) {
  if (HEX.test(v || '')) return v.length === 4 ? '#' + [...v.slice(1)].map((c) => c + c).join('') : v;
  const m = /^rgb\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*\)$/i.exec(v || '');
  return m && m.slice(1).every((n) => n <= 255) ? '#' + m.slice(1).map((n) => Number(n).toString(16).padStart(2, '0')).join('') : null;
}

function emailTheme(css) {
  css = withoutAtBlocks(css.replace(/\/\*[\s\S]*?\*\//g, ''));
  const vars = {};
  for (const block of css.matchAll(/:root\s*\{([^}]*)\}/g)) for (const [k, v] of decls(block[1])) if (k.startsWith('--')) vars[k] = v;
  const resolve = (v, depth = 0) => String(v || '').replace(/var\(\s*(--[\w-]+)\s*(?:,((?:[^()]|\([^()]*\))*))?\)/g, (m, name, fallback) => {
    if (depth > 5) return m;
    if (name in vars) return resolve(vars[name], depth + 1);
    return fallback === undefined ? m : resolve(fallback, depth + 1);
  }).trim();
  // Last matching declaration across every rule for the selector wins, as in CSS.
  const prop = (selector, names) => {
    let found = null;
    for (const rule of css.matchAll(new RegExp('(?:^|[}\\s])' + selector + '\\s*\\{([^}]*)\\}', 'g'))) {
      for (const [k, v] of decls(rule[1])) if (names.includes(k)) found = v;
    }
    return found && resolve(found);
  };
  const t = { ...DEFAULT_THEME };
  const bg = toHex(prop('body', ['background', 'background-color']));
  const ink = toHex(prop('body', ['color']));
  if (bg && ink && Math.abs(luma(bg) - luma(ink)) >= MIN_CONTRAST) Object.assign(t, { bg, ink });
  const accent = toHex(prop('\\.btn\\.primary', ['background', 'background-color'])) || toHex(resolve('var(--glow)')) || t.accent;
  const on = toHex(prop('\\.btn\\.primary', ['color']));
  t.accent = accent;
  t.onAccent = on && Math.abs(luma(on) - luma(accent)) >= MIN_CONTRAST ? on : luma(accent) > 140 ? '#14110c' : '#ffffff';
  t.card = mix(t.bg, t.ink, 0.07);
  t.muted = mix(t.ink, t.bg, 0.35);
  t.hair = mix(t.bg, t.ink, 0.16);
  for (const k of ['display', 'body']) {
    const f = resolve(vars['--' + k]);
    if (f && !f.includes('var(')) t[k] = f.replace(/"/g, "'");
  }
  return t;
}

function build(root) {
  const site = path.join(root, 'site');
  const gas = path.join(root, 'gas');
  const read = (f) => fs.readFileSync(path.join(site, f), 'utf8');
  const css = read('styles.css');
  const js = safe(read('app.js'));
  const data = safe(JSON.stringify(JSON.parse(read('event.resolved.json'))));
  const used = new Map();

  const dataUri = (file) => {
    const full = path.join(site, file);
    if (!fs.existsSync(full)) return null;
    if (!used.has(file)) used.set(file, fs.readFileSync(full));
    return `data:${MIME[path.extname(file).slice(1).toLowerCase()] || 'application/octet-stream'};base64,${used.get(file).toString('base64')}`;
  };
  const inlineAssets = (text) => text.replace(/assets\/[\w.-]+/g, (m) => dataUri(m) || m);

  const pages = fs.readdirSync(site).filter((f) => f.endsWith('.html')).sort();
  const favicon = dataUri('favicon.svg');
  for (const f of pages) {
    let html = read(f)
      .replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${css}\n</style>`)
      .replace('<script src="app.js"></script>', () => `<script>window.EVENT_DATA = ${data};</script>\n  <script>\n${js}\n  </script>`);
    if (favicon) html = html.replace('href="favicon.svg"', () => `href="${favicon}"`);
    // CSS and the event JSON reference assets too, so rewrite after they are in place.
    write(path.join(gas, `page_${path.basename(f, '.html')}.html`), scriptsSafe(inlineAssets(html)));
  }
  for (const stale of fs.readdirSync(gas).filter((x) => /^page_.*\.html$/.test(x))) {
    if (!pages.includes(stale.slice(5))) fs.unlinkSync(path.join(gas, stale));
  }

  const total = [...used.values()].reduce((n, b) => n + b.length, 0);
  if (total > LIMIT) console.error(`Warning: ${(total / 1024 / 1024).toFixed(1)} MB of images are inlined into every page. Resize them (see recipes/media.md) or the pages will load slowly.`);

  write(path.join(gas, 'pages.gen.js'), `// GENERATED by scripts/build-gas-site.js. Do not edit.\nconst PAGES = ${JSON.stringify(pages.map((f) => path.basename(f, '.html')))};\n`);
  const hero = JSON.parse(data).images?.hero?.src;
  const heroFile = hero && path.join(site, hero);
  const mime = MIME[path.extname(hero || '').slice(1).toLowerCase()] || 'image/jpeg';
  const b64 = heroFile && mime.startsWith('image/') && fs.existsSync(heroFile) ? fs.readFileSync(heroFile).toString('base64') : '';
  write(path.join(gas, 'hero.gen.js'), `// GENERATED by scripts/build-gas-site.js. Do not edit.\nvar HERO_B64 = '${b64}';\nvar HERO_MIME = '${mime}';\nvar EMAIL_THEME = ${JSON.stringify(emailTheme(css))};\n`);
  return { pages, bytes: total };
}

module.exports = { build, noSlashes, emailTheme };
if (require.main === module) {
  const r = build(path.join(__dirname, '..'));
  console.log(`Built ${r.pages.length} pages for Apps Script.`);
}
