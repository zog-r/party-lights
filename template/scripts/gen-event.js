// event.json is the single source of truth. This bakes it into the places that can't read it at runtime:
// gas/event.gen.js (Apps Script can't read site files), the Apps Script timezone, and each page's <title>
// and og: tags (link previews in iMessage/WhatsApp don't run JavaScript). It first fills the fields fields.json
// marks derive_by "code" (date line, stay days, room counts...) when the host left them out; values the host set win.
// Derived values are never written back to site/event.json (they'd go stale when the host edits dates or rooms);
// the site reads them from the generated site/event.resolved.json instead.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

const blank = (v) => v === undefined || v === null || v === '';
const day = (d, o) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', ...o });

function fillDerived(ev) {
  const set = (obj, key, value) => { if (blank(obj[key])) obj[key] = value; };
  set(ev, 'brand', ev.title);
  set(ev, 'tagline', ev.intro.match(/^.*?[.!?](?=\s|$)/)?.[0] || ev.intro);
  ev.reply ||= {};
  set(ev.reply, 'title', 'Will you make it?');
  set(ev.reply, 'sub', "Tell us who's coming so we can plan.");
  if ((ev.features || []).includes('activities')) set(ev, 'activities_intro', 'Games and fun are on the menu. Propose one, lead one, or just join in.');
  if (ev.house) set(ev.house, 'kicker', ev.area);
  if (ev.main?.start) {
    const [d, t] = ev.main.start.split('T');
    const [h, m] = t.split(':').map(Number);
    set(ev, 'when_text', `${day(d, { weekday: 'short', month: 'short', day: 'numeric' })} · ${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`);
  }
  const { earliest_arrival: from, latest_departure: to } = ev.stay || {};
  if (from && to) {
    const dates = [];
    for (let t = Date.parse(from); t <= Date.parse(to); t += 864e5) dates.push(new Date(t).toISOString().slice(0, 10));
    set(ev.stay, 'nights', dates.length - 1);
    const wd = (d) => day(d, { weekday: 'short' });
    set(ev, 'stay_text', `Stay ${wd(from)}–${wd(to)}, optional`);
    if (blank(ev.stay_days)) {
      const seen = new Set();
      ev.stay_days = dates.map((d) => {
        const id = seen.has(wd(d).toLowerCase()) ? d.slice(5).replace('-', '') : wd(d).toLowerCase();
        seen.add(id);
        return { id, label: `${wd(d)} ${day(d, { month: 'numeric', day: 'numeric' })}` };
      });
    }
  }
  if (ev.rooms?.list) {
    set(ev.rooms, 'total', ev.rooms.list.length);
    set(ev.rooms, 'host_reserved', ev.rooms.list.filter((r) => r.reserved).length);
  }
  return ev;
}

// Apps Script reads these without checking, so give off modules an empty value.
const bake = (event) => ({ ...event, food_slots: event.food_slots || [], stay_days: event.stay_days || [], trip_seeds: event.trip_seeds || [],
  rooms: event.rooms || { list: [] }, reminders: event.reminders || { remind_days: [], confirm_days: [] } });

module.exports = { fillDerived, bake };
if (require.main !== module) return;
const eventFile = path.join(root, 'site/event.json');
const event = fillDerived(JSON.parse(fs.readFileSync(eventFile, 'utf8')));

// Skip unchanged writes so mtimes (and the build-phase test cache) stay stable.
const write = (file, text) => { if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) fs.writeFileSync(file, text); };
write(path.join(root, 'site/event.resolved.json'), JSON.stringify(event, null, 2) + '\n');

const baked = bake(event);

write(path.join(root, 'gas/event.gen.js'), `// GENERATED from site/event.json by scripts/gen-event.js. Do not edit.\nconst EVENT = ${JSON.stringify(baked, null, 2)};\n`);

const manifest = path.join(root, 'gas/appsscript.json');
const app = JSON.parse(fs.readFileSync(manifest, 'utf8'));
app.timeZone = event.timezone;
write(manifest, JSON.stringify(app, null, 2) + '\n');

const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const site = path.join(root, 'site');
const image = event.site_url ? `${event.site_url}/${event.images.hero.src}` : event.images.hero.src;
for (const f of fs.readdirSync(site).filter((x) => x.endsWith('.html'))) {
  const file = path.join(site, f);
  const html = fs.readFileSync(file, 'utf8')
    .replace(/<title>(?:([^<]*?) · )?[^<]*<\/title>/, (_, page) => `<title>${page ? page + ' · ' : ''}${attr(event.title)}</title>`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${attr(event.title)}`)
    .replace(/(<meta (?:property="og:description"|name="description") content=")[^"]*/g, `$1${attr(event.tagline)}`)
    .replace(/(<meta property="og:image" content=")[^"]*/, `$1${attr(image)}`);
  write(file, html);
}

require('./build-gas-site.js').build(root);
