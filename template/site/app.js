// Shared by every page: event config, guest token, API client, nav, calendar links.

const App = (() => {
  // Served by Apps Script, the page runs in a sandbox iframe: the server hands over the real query and base URL as window.GAS.
  const GAS = typeof window !== 'undefined' && window.GAS ? window.GAS : null;
  const params = GAS ? new URLSearchParams(Object.entries(GAS.params || {})) : new URLSearchParams(location.search);
  const pageName = () => (GAS ? GAS.params.page || 'index' : (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index');
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode: token stays in URL only */ } },
  };
  if (params.get('t')) store.set('token', params.get('t'));
  const token = params.get('t') || store.get('token');
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

  let eventPromise;
  const event = () => (eventPromise ||= GAS ? Promise.resolve(window.EVENT_DATA) : fetch('event.resolved.json').then((r) => r.json()));

  const gasApi = (action, body) => new Promise((resolve, reject) => {
    const fail = (err) => reject(Object.assign(new Error(err), { code: err }));
    window.google.script.run
      .withSuccessHandler((out) => (out && out.ok ? resolve(out.data) : fail(out ? out.error : 'No response.')))
      .withFailureHandler((err) => fail(String((err && err.message) || err)))
      .api(JSON.stringify({ action, token, ...body }));
  });

  async function api(action, body = {}) {
    if (GAS) return gasApi(action, body);
    const ev = await event();
    const url = isLocal ? 'http://localhost:8787' : ev.api_url;
    // text/plain keeps this a "simple" request, so Apps Script doesn't need to answer a CORS preflight.
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action, token, ...body }) });
    const out = await res.json();
    if (!out.ok) throw Object.assign(new Error(out.error), { code: out.error });
    return out.data;
  }

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const link = (page) => {
    if (/^https?:/.test(page)) return page; // already rewritten
    if (!GAS) return page + (token ? `?t=${encodeURIComponent(token)}` : '');
    return `${GAS.base}?page=${page.replace(/\.html$/, '')}` + (token ? `&t=${encodeURIComponent(token)}` : '');
  };

  // Pages that belong to an optional module (ids from fields.json). An event with no `features` list shows them all.
  const PAGE_MODULE = { 'house.html': 'place', 'menu.html': 'menu', 'guests.html': 'guest_list', 'trips.html': 'trips' };
  const on = (ev, id) => !ev.features || ev.features.includes(id);

  // What the RSVP form asks, from event.json's rsvp block.
  const rsvpOpts = (ev) => {
    const r = ev.rsvp || {};
    return { maybe: r.allow_maybe !== false, kids: r.ask_kids !== false && ev.policies?.kids !== false, partyNames: r.ask_party_names !== false,
      plusOne: r.ask_plus_one === true, dietary: r.ask_dietary ?? (!!ev.features && on(ev, 'dietary')) };
  };

  // Markup tagged data-module="a b" is for those modules (any one on keeps it). Anything else is removed so copy about
  // features the host never described cannot show. Pages call this through boot(), before their own render runs.
  const prune = (ev) => document.querySelectorAll('[data-module]').forEach((el) => {
    if (!el.dataset.module.split(/\s+/).some((m) => on(ev, m))) el.remove();
  });

  function nav() {
    const here = pageName() + '.html';
    const items = [['index.html', 'Invite'], ['house.html', 'The house'], ['rsvp.html', 'RSVP'], ['details.html', 'Details'],
      ['menu.html', 'The menu'], ['guests.html', 'Guests'], ['trips.html', 'Day trips']];
    const el = $('#nav');
    if (el) event().then((ev) => {
      el.innerHTML = items.filter(([href]) => !PAGE_MODULE[href] || on(ev, PAGE_MODULE[href])).map(([href, label]) =>
        `<a data-page="${href.replace('.html', '')}" href="${link(href)}"${href === here ? ' aria-current="page"' : ''}>${label}</a>`).join('');
    });
  }

  function toast(msg) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // Pages hardcode relative hrefs like rsvp.html; under Apps Script those must become ?page= URLs.
  function rewriteLinks() {
    document.querySelectorAll('a[href$=".html"], a[href*=".html?"]').forEach((a) => {
      const href = a.getAttribute('href');
      if (!/^[\w-]+\.html(\?|$)/.test(href)) return;
      a.setAttribute('href', link(href.split('?')[0]));
    });
  }

  // The injected <base target="_top"> would send "#reply" links to the top window; keep them in the iframe and scroll.
  function fragmentLinks() {
    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      a.setAttribute('target', '_self');
      a.addEventListener('click', (e) => {
        const el = document.getElementById(a.getAttribute('href').slice(1));
        if (!el) return;
        e.preventDefault();
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  // Loads the guest; renders the "ask the host for your link" gate if the token is missing or bad.
  async function boot({ gate: useGate = true } = {}) {
    const ev = await event();
    document.querySelectorAll('a.brand').forEach((b) => (b.textContent = ev.brand));
    prune(ev);
    if (GAS) { rewriteLinks(); fragmentLinks(); }
    const mod = PAGE_MODULE[pageName() + '.html'];
    if (mod && !on(ev, mod)) {
      // Returns null like the token gate does, so the page's own render never overwrites this.
      $('main').innerHTML = `<section class="card gate"><h2>Not part of this event</h2><p>There's nothing on this page for this one.</p>
        <a class="btn primary" href="${link('index.html')}">Back to the invite</a></section>`;
      nav(null);
      return null;
    }
    const gateOrNull = () => (useGate ? gate() : (nav(null), null));
    if (!token) return gateOrNull();
    try {
      const me = await api('me');
      nav(me);
      const days = params.get('confirm');
      if (days && me.guest.status === 'yes' && !me.guest['confirmed_' + days]) {
        await api('confirm', { days: Number(days) });
        me.guest['confirmed_' + days] = new Date().toISOString();
        toast("You're confirmed. See you there!");
      }
      return me;
    } catch (err) {
      if (err.code === 'bad_token') return gateOrNull();
      throw err;
    }
  }

  function gate() {
    nav(null);
    const main = $('main');
    if (main) main.innerHTML = `<section class="card gate"><h2>This invite is personal</h2>
      <p>Open the link from your invitation text or email. Lost it? Ask the host to resend it.</p></section>`;
    return null;
  }

  // Wall-clock time in `tz` → UTC stamp like 20261213T000000Z.
  function utcStamp(localIso, tz) {
    const [d, t] = localIso.split('T');
    const guess = new Date(`${d}T${t}:00Z`);
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(guess).map((p) => [p.type, p.value]));
    const asTz = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const utc = new Date(guess.getTime() - (asTz - guess.getTime()));
    return utc.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  // All-day DTEND and Google's end date are exclusive, so the last day is departure + 1.
  function calendarSpan(ev) {
    const { earliest_arrival: from, latest_departure: to } = ev.stay || {};
    if ((ev.calendar || {}).span === 'main' || !from || !to) {
      return { allDay: false, start: utcStamp(ev.main.start, ev.timezone), end: utcStamp(ev.main.end, ev.timezone) };
    }
    const last = new Date(Date.parse(to + 'T00:00:00Z') + 864e5);
    return { allDay: true, start: from.replace(/-/g, ''), end: last.toISOString().slice(0, 10).replace(/-/g, '') };
  }

  function calendar(ev, me) {
    const { allDay, start, end } = calendarSpan(ev);
    const where = me.address || ev.area;
    const details = [ev.tagline, allDay && `Main event: ${ev.main.label}, ${ev.when_text}.`, ev.stay && `Stay window: ${ev.stay.earliest_arrival} to ${ev.stay.latest_departure}.`,
      me.directions, `Your invite: ${GAS ? '' : location.origin + location.pathname.replace(/[^/]*$/, '')}${link('index.html')}`]
      .filter(Boolean).join('\n\n');
    const google = 'https://calendar.google.com/calendar/render?' + new URLSearchParams({
      action: 'TEMPLATE', text: ev.title, dates: `${start}/${end}`, details, location: where });
    const icsEsc = (s) => String(s).replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//invite//EN', 'BEGIN:VEVENT',
      `UID:${start}-${(token || 'guest')}@invite`, `DTSTAMP:${utcStamp(new Date().toISOString().slice(0, 16), 'UTC')}`,
      `DTSTART${allDay ? ';VALUE=DATE' : ''}:${start}`, `DTEND${allDay ? ';VALUE=DATE' : ''}:${end}`, `SUMMARY:${icsEsc(ev.title)}`, `LOCATION:${icsEsc(where)}`,
      `DESCRIPTION:${icsEsc(details)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    return { google, ics: 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics) };
  }

  return { token, params, gas: GAS, event, api, boot, nav, on, prune, rsvpOpts, toast, $, esc, link, calendar, calendarSpan, utcStamp };
})();
