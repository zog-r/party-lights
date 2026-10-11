// The phase engine: reads real conditions and says what to do next.
//   node scripts/next.js [--json] [--mark <phase>[=value]] [--unmark <phase>] [--event f] [--app dir]
// State lives in .party-lights/state.json: {event, app, marks}. The order lives here; the party-lights skill only narrates.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const PHASES = ['doctor', 'describe', 'build', 'design', 'review', 'approve', 'google', 'publish', 'smoke', 'invite'];
const TITLES = {
  doctor: 'Check your setup', describe: 'Describe your event', build: 'Build your invite app', design: 'Pick the look',
  review: 'Quick quality check', approve: 'Try it and approve', google: 'Connect your Google Sheet', publish: 'Put it online',
  smoke: 'Test it live', invite: 'Send the invites',
};
const WHY = {
  describe: 'Tell me about your event in your own words, and I will fill in the details and ask only what is missing.',
  build: 'I turn your event details into a working invite site with a guest list behind it.',
  design: 'We can give the site a custom look, or keep the clean default.',
  review: 'A quick honest look at the pages before you see them.',
  approve: 'Click around your invite like a guest would, and tell me what to change.',
  google: 'Your guest list lives in a Google Sheet you own. You will approve access once.',
  publish: 'Your invite is served by Google at a link you can text to people.',
  smoke: 'RSVP as yourself on the live site before anyone else sees it.',
  invite: 'Add your guests to the Sheet and send the invites.',
};
const DESIGN_STOPS = /^(PASS|STOP_MAX|STOP_PLATEAU)/i;

const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const slug = (s) => String(s || 'my-event').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-event';

function newestMtime(dir) {
  let m = 0;
  const walk = (d) => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else m = Math.max(m, fs.statSync(p).mtimeMs);
    }
  };
  walk(dir);
  return m;
}

// Tolerant read of the design-loop manifest: any decision-ish key holding PASS / STOP_MAX / STOP_PLATEAU, top level or last round.
function designDecision(manifest) {
  if (!manifest || typeof manifest !== 'object') return null;
  const keys = ['decision', 'stop', 'stop_reason', 'status', 'final_decision'];
  const scan = (o) => {
    if (!o || typeof o !== 'object') return null;
    for (const k of keys) if (typeof o[k] === 'string' && DESIGN_STOPS.test(o[k])) return o[k];
    return null;
  };
  const rounds = manifest.rounds || manifest.iterations || [];
  return scan(manifest) || scan(manifest.final) || (Array.isArray(rounds) ? scan(rounds[rounds.length - 1]) : null);
}

const unescapeHtml = (s) => String(s).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const pageTitle = (html) => { const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html || ''); return m ? unescapeHtml(m[1]).trim().toLowerCase() : ''; };

function loadState(root) {
  return { event: './event.json', app: null, marks: {}, ...(readJSON(path.join(root, '.party-lights/state.json')) || {}) };
}
function saveState(root, state) {
  fs.mkdirSync(path.join(root, '.party-lights'), { recursive: true });
  fs.writeFileSync(path.join(root, '.party-lights/state.json'), JSON.stringify(state, null, 2) + '\n');
}

function realDeps(root) {
  return {
    nodeMajor: () => Number(process.versions.node.split('.')[0]),
    has: (cmd) => spawnSync('which', [cmd], { stdio: 'ignore' }).status === 0 ||
      (cmd === 'chrome' && fs.existsSync('/Applications/Google Chrome.app')),
    validate: (eventFile, appDir) => {
      const script = appDir ? path.join(appDir, 'scripts/validate-event.js') : path.join(root, 'template/scripts/validate-event.js');
      const r = spawnSync('node', [script, eventFile], { encoding: 'utf8' });
      return { ok: r.status === 0, output: (r.stdout + r.stderr).trim() };
    },
    runTests: (appDir) => spawnSync('npm', ['test'], { cwd: appDir, stdio: 'ignore' }).status === 0,
    fetchStatus: async (url) => {
      try { return (await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'follow' })).status; } catch { return null; }
    },
    fetchPage: async (url) => {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'follow' });
        return { status: r.status, body: await r.text() };
      } catch { return null; }
    },
  };
}

// Returns the card for the first unfinished phase.
async function evaluate({ root = ROOT, home = os.homedir(), state, deps = realDeps(root) }) {
  const marks = state.marks || {};
  const eventFile = path.resolve(root, state.event || './event.json');
  const done = [];
  const card = (phase, extra) => ({
    phase, step: PHASES.indexOf(phase), total: 9, title: TITLES[phase], why: WHY[phase] || '', status: 'todo',
    run: [], host_run: [], links: [], ask: [], done: [...done], ...extra,
  });

  // 0 doctor
  const missing = [];
  if (deps.nodeMajor() < 20) missing.push({ tool: 'node', hint: 'Install Node 20 or newer from https://nodejs.org' });
  const design = [];
  if (!deps.has('python3')) design.push({ tool: 'python3', hint: 'brew install python3' });
  if (!deps.has('chrome')) design.push({ tool: 'Google Chrome', hint: 'https://www.google.com/chrome' });
  if (!deps.has('claude')) design.push({ tool: 'claude CLI', hint: 'https://claude.com/claude-code' });
  const doctor = { blocking: missing, needed_for_design: design };
  if (missing.length) return card('doctor', { why: 'Something small is missing on this computer.', ask: missing.map((m) => `${m.tool}: ${m.hint}`), doctor });
  done.push('doctor');

  // 1 describe
  const eventOk = fs.existsSync(eventFile) ? deps.validate(eventFile) : { ok: false, output: 'no event.json yet' };
  if (!eventOk.ok || !marks.describe) {
    return card('describe', {
      doctor,
      run: eventOk.ok ? [] : [fs.existsSync(eventFile) ? `node scripts/intake.js questions --event ${state.event}` : 'node scripts/intake.js start --type <id> --out event.json'],
      ask: eventOk.ok ? ['Read the event back in 5 lines. On a yes: node scripts/next.js --mark describe'] : [eventOk.output],
    });
  }
  done.push('describe');

  // 2 build
  const ev = readJSON(eventFile) || {};
  if (!state.app) state.app = `../${slug(ev.title)}`;
  const app = path.resolve(root, state.app);
  const appRel = state.app;
  const built = fs.existsSync(path.join(app, 'site/event.json'));
  let testsOk = false;
  if (built) {
    const key = Math.max(newestMtime(path.join(app, 'site')), newestMtime(path.join(app, 'gas')));
    if (state.cache && state.cache.app === app && state.cache.key === key) testsOk = state.cache.ok;
    else {
      testsOk = deps.runTests(app);
      state.cache = { app, key, ok: testsOk };
    }
  }
  if (!built) return card('build', { run: [`npm run new -- ${appRel} --event ./event.json`, `cd ${appRel} && npm test`] });
  if (!testsOk) return card('build', { why: 'The app is there, but its tests fail. I will fix that first.', run: [`cd ${appRel} && npm test`] });
  done.push('build');

  // 3 design
  const manifest = readJSON(path.join(app, '.design-loop/manifest.json'));
  if (!(marks.design === 'skipped' || designDecision(manifest))) {
    return card('design', {
      doctor,
      run: [`node scripts/design-brief.js --app ${appRel}`],
      ask: ['Want a custom look (a few minutes, needs python3, Chrome and the claude CLI) or keep the default?',
        'Keep default: node scripts/next.js --mark design=skipped'],
    });
  }
  done.push('design');

  // 4 review, 5 approve
  if (!marks.review) {
    return card('review', { run: [`cd ${appRel} && npm run dev`, `cd ${appRel} && npm run serve`], links: previewLinks() });
  }
  done.push('review');
  if (!marks.approve) return card('approve', { run: [`cd ${appRel} && npm run dev`, `cd ${appRel} && npm run serve`], links: previewLinks(), ask: ['Anything to change? Say "looks good" when you are happy.'] });
  done.push('approve');

  // 6 google
  const claspRc = path.join(home, '.clasprc.json');
  const clasp = readJSON(path.join(app, 'gas/.clasp.json'));
  const siteEv = readJSON(path.join(app, 'site/event.json')) || {};
  const apiOk = /\/macros\/s\/[\w-]+\/exec/.test(siteEv.api_url || '');
  const apiToggle = { label: 'Turn on the Apps Script API', url: 'https://script.google.com/home/usersettings' };
  if (!fs.existsSync(claspRc)) {
    return card('google', {
      why: 'First, sign in to Google so I can create your Sheet. This opens a browser.',
      host_run: [`cd ${appRel}/gas && npx -y @google/clasp login`], links: [apiToggle], ask: ['Switch the Apps Script API on (link), then sign in.'],
    });
  }
  if (!clasp || !clasp.scriptId || !apiOk) {
    return card('google', { why: 'Signed in. Now I create your Sheet and its backend.', run: [`cd ${appRel} && npm run google`], links: [apiToggle, ...sheetLinks(clasp)] });
  }
  if (!marks.sheet) {
    return card('google', {
      why: 'Your Sheet exists. Open it, reload, then run Invite app, Set up / repair tabs, and approve access. That also turns on reminders and alerts.',
      ask: ['In the Sheet, the Invite app menu appears next to Help after a few seconds (reload if not) → Invite app → Set up / repair tabs → Continue → pick your account → on "Google hasn\'t verified this app", click Advanced → Go to <your event> (unsafe) → Allow. It says unsafe because the script is yours and Google hasn\'t reviewed it; it runs only in your account.'],
      links: sheetLinks(clasp), ask: ['Tell me when the tabs are set up.', 'Then: node scripts/next.js --mark sheet'],
    });
  }
  done.push('google');

  // 7 publish
  const hosting = marks.hosting === 'vercel' ? 'vercel' : 'gas';
  if (hosting === 'gas') {
    const want = String(ev.title || '').trim().toLowerCase();
    const page = apiOk ? await deps.fetchPage(siteEv.api_url) : null;
    const live = !!page && page.status === 200 && !!want && pageTitle(page.body).includes(want);
    if (!live) {
      const unreachable = apiOk && page === null;
      return card('publish', {
        status: unreachable ? 'unreachable' : 'todo',
        why: unreachable ? `Couldn't reach ${siteEv.api_url}. Check your connection, then run this again.`
          : 'Your invite is served by Google. I am checking that the link opens your event.',
        run: [`cd ${appRel} && npm run deploy`], links: apiOk ? [{ label: 'Your invite link', url: siteEv.api_url }] : [],
      });
    }
    done.push('publish');
  } else {
    let code = null;
    if (siteEv.site_url) code = await deps.fetchStatus(siteEv.site_url);
    if (code !== 200) {
      const unreachable = siteEv.site_url && code === null;
      return card('publish', {
        status: unreachable ? 'unreachable' : 'todo',
        why: unreachable ? `Couldn't reach ${siteEv.site_url}. Check your connection, or run this to put it online again.` : 'This puts the pages on your own Vercel account and gives you a link to text to people.',
        run: [`cd ${appRel} && npm run host`], links: [{ label: 'Vercel login', url: 'https://vercel.com/login' }],
      });
    }
    done.push('publish');
  }

  // 8 smoke, 9 invite
  const base = hosting === 'vercel' && siteEv.site_url ? siteEv.site_url : siteEv.api_url;
  const live = [{ label: 'Your live invite', url: base }, ...sheetLinks(clasp)];
  const adminNote = hosting === 'vercel' && siteEv.site_url
    ? `Your host page: ${base}/admin.html?k=<your admin_key from the Sheet's Settings>`
    : `Your host page: add ?page=admin&k=<your admin_key from the Sheet's Settings> to ${base}`;
  if (!marks.smoke) return card('smoke', { links: live, ask: ['RSVP yes as yourself, check the address shows, and that the alert arrives (up to 5 minutes).', adminNote, 'Then: node scripts/next.js --mark smoke'] });
  done.push('smoke');
  if (!marks.invite) return card('invite', { links: live, ask: [adminNote, 'Guest links get ?t=<token> added by the Sheet\'s invite buttons.', 'Add guests, Generate missing tokens, send invites. Then: node scripts/next.js --mark invite'] });
  done.push('invite');

  return {
    phase: 'done', step: 9, total: 9, title: 'Your event lives in the Sheet',
    why: 'Everything is set. The Sheet is your control room.', status: 'done', run: [], host_run: [], ask: [], done: [...done], links: live,
    notes: [
      'Add guests: Guests tab (name, email, phone), then Invite app, Generate missing tokens.',
      'Send invites: select rows, then Invite app, Email or Text invites. The admin page also has text buttons.',
      'Watch RSVPs: the Guests tab and the admin page.',
      adminNote,
      'Your event lives in the Sheet: the guest list, settings and RSVPs are all there.',
      `Edit the site later: change ${appRel}/site/event.json, then run npm run deploy there. Links already sent keep working.`,
    ],
    host_run_later: [`cd ${appRel} && npm run deploy`],
  };
}

function previewLinks() {
  return [
    { label: 'Invite, as a guest who said yes', url: 'http://localhost:5173/?t=test1' },
    { label: 'RSVP, as an invited guest', url: 'http://localhost:5173/rsvp.html?t=test2' },
    { label: 'Menu', url: 'http://localhost:5173/menu.html?t=test1' },
    { label: 'Admin', url: 'http://localhost:5173/admin.html?k=dev' },
  ];
}
function sheetLinks(clasp) {
  const links = [];
  if (clasp && clasp.parentId) links.push({ label: 'Your Sheet', url: `https://docs.google.com/spreadsheets/d/${[].concat(clasp.parentId)[0]}` });
  if (clasp && clasp.scriptId) links.push({ label: 'Script editor', url: `https://script.google.com/d/${clasp.scriptId}/edit` });
  return links;
}

function print(c) {
  const out = [c.phase === 'done' ? `Done: ${c.title}` : c.phase === 'doctor' ? `Setup check: ${c.title}` : `Step ${c.step} of ${c.total}: ${c.title}`, '', c.why];
  if (c.status === 'unreachable') out.push('(offline?)');
  for (const a of c.ask) out.push('', a);
  for (const n of c.notes || []) out.push(`- ${n}`);
  if (c.run.length) out.push('', 'I will run:', ...c.run.map((r) => `  ${r}`));
  for (const h of [...c.host_run, ...(c.host_run_later || [])]) out.push('', 'Press Run on this:', '```bash', h, '```');
  if (c.links.length) out.push('', ...c.links.map((l) => `- [${l.label}](${l.url})`));
  return out.join('\n');
}

async function main(argv) {
  const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const state = loadState(ROOT);
  if (opt('--event')) state.event = opt('--event');
  if (opt('--app')) { state.app = opt('--app'); delete state.cache; }
  const mark = opt('--mark');
  if (mark) { const [k, ...v] = mark.split('='); state.marks[k] = v.length ? v.join('=') : true; }
  if (opt('--unmark')) delete state.marks[opt('--unmark')];
  const c = await evaluate({ state });
  saveState(ROOT, state);
  console.log(argv.includes('--json') ? JSON.stringify(c, null, 2) : print(c));
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { evaluate, designDecision, PHASES, print };
