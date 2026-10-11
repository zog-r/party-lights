// Validate site/event.json against event.schema.json plus the cross-field rules a schema can't express.
// `node scripts/validate-event.js [path]` prints every problem and exits 1 if there are any. No dependencies.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const schema = JSON.parse(fs.readFileSync(path.join(root, 'event.schema.json'), 'utf8'));

// ponytail: covers the keywords event.schema.json uses (type, required, properties, items, pattern,
// minLength, minItems, minimum, enum, $ref). Swap in ajv if the schema grows past that.
function check(value, s, at, errs) {
  if (s.$ref) s = s.$ref.split('/').slice(1).reduce((o, k) => o[k], schema);
  const type = Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value;
  if (s.type && s.type !== type && !(s.type === 'number' && type === 'integer')) return errs.push(`${at}: expected ${s.type}, got ${type}`);
  if (s.enum && !s.enum.includes(value)) errs.push(`${at}: must be one of ${s.enum.join(', ')}`);
  if (s.minLength != null && value.length < s.minLength) errs.push(`${at}: must not be empty`);
  if (s.pattern && !new RegExp(s.pattern).test(value)) errs.push(`${at}: "${value}" doesn't match ${s.pattern}`);
  if (s.minimum != null && value < s.minimum) errs.push(`${at}: must be >= ${s.minimum}`);
  if (s.minItems != null && value.length < s.minItems) errs.push(`${at}: needs at least ${s.minItems} item(s)`);
  for (const k of s.required || []) if (value[k] === undefined) errs.push(`${at}.${k}: required`);
  for (const [k, sub] of Object.entries(s.properties || {})) if (value[k] !== undefined) check(value[k], sub, `${at}.${k}`, errs);
  if (s.items) value.forEach((v, i) => check(v, s.items, `${at}[${i}]`, errs));
  return errs;
}

const registry = JSON.parse(fs.readFileSync(path.join(root, 'fields.json'), 'utf8'));

// A key like "rooms.list[].id" or "stay_days[]": true when the value is absent, empty, or an empty list.
function isMissing(ev, key) {
  let nodes = [ev];
  for (const part of key.split('.')) {
    const isList = part.endsWith('[]');
    const next = nodes.map((n) => n?.[isList ? part.slice(0, -2) : part]);
    if (isList) {
      if (next.some((v) => !Array.isArray(v) || !v.length)) return true;
      nodes = next.flat();
    } else nodes = next;
  }
  return nodes.some((v) => v === undefined || v === null || v === '');
}

// Always-on modules plus `features`. Older events have no `features`: a module counts as on when its first field is present.
function modulesOn(ev) {
  const on = new Set(registry.modules.filter((m) => m.always).map((m) => m.id));
  if (Array.isArray(ev.features)) ev.features.forEach((id) => on.add(id));
  else registry.modules.filter((m) => m.fields[0].where === 'event.json' && !isMissing(ev, m.fields[0].key)).forEach((m) => on.add(m.id));
  return on;
}

function validate(ev, { assetsDir } = {}) {
  const errs = check(ev, schema, 'event', []);
  if (errs.length) return errs; // cross-field rules assume the shape is right
  const known = registry.modules.map((m) => m.id);
  (ev.features || []).filter((id) => !known.includes(id)).forEach((id) => errs.push(`features: unknown piece "${id}"`));
  if (errs.length) return errs;
  const on = modulesOn(ev);
  for (const m of registry.modules.filter((m) => on.has(m.id))) {
    for (const n of m.needs || []) if (!on.has(n)) errs.push(`features: "${m.id}" needs "${n}" turned on too`);
    for (const f of m.fields) {
      const derived = f.derive && f.derive_by !== 'agent';
      if (!f.required || f.where !== 'event.json' || derived || f.key.includes('*')) continue;
      if (f.key === 'event_type' && !ev.features) continue; // older events predate it
      if (isMissing(ev, f.key)) errs.push(`event.${f.key}: required (${m.label} is on)`);
    }
  }
  if (errs.length) return errs;
  const dupes = (list, name) => {
    const ids = (list || []).map((x) => x.id);
    ids.filter((id, i) => ids.indexOf(id) !== i).forEach((id) => errs.push(`${name}: duplicate id "${id}"`));
  };
  dupes(ev.food_slots, 'food_slots');
  dupes(ev.stay_days, 'stay_days');
  dupes(ev.rooms?.list, 'rooms.list');
  if (ev.title_em && !ev.title.endsWith(ev.title_em)) errs.push('title_em: must be the end of title');
  const day = ev.main.start.slice(0, 10);
  // May cross midnight (a New Year's Eve party ends the next day), so only the order matters.
  if (ev.main.end <= ev.main.start) errs.push('main.end: must be after main.start');
  const inStay = (d) => d >= ev.stay.earliest_arrival && d <= ev.stay.latest_departure;
  if (on.has('stay') && !inStay(day)) errs.push('main.start: must fall inside the stay window');
  if (on.has('schedule')) {
    if (!ev.schedule.some((s) => s.date === day)) errs.push(`schedule: needs a row for the main day ${day}`);
    if (on.has('stay')) ev.schedule.forEach((s, i) => { if (!inStay(s.date)) errs.push(`schedule[${i}].date: outside the stay window`); });
  }
  try { new Intl.DateTimeFormat('en-US', { timeZone: ev.timezone }); } catch { errs.push(`timezone: unknown zone "${ev.timezone}"`); }
  if (assetsDir) {
    const imgs = [...Object.values(ev.images), ...(ev.house?.gallery || []), ...(ev.house?.spaces || []), ...(ev.house?.video ? [ev.house.video] : [])];
    for (const src of imgs.flatMap((im) => [im.src, im.poster].filter(Boolean))) {
      if (!fs.existsSync(path.join(assetsDir, '..', src))) errs.push(`missing file: site/${src}`);
    }
  }
  return errs;
}

module.exports = { validate, modulesOn, isMissing, registry };

if (require.main === module) {
  const file = process.argv[2] || path.join(root, 'site/event.json');
  // Only an app's site/event.json sits beside an assets folder; an intake starter event lives outside any app.
  const assetsDir = path.join(path.dirname(path.resolve(file)), 'assets');
  const errs = validate(JSON.parse(fs.readFileSync(file, 'utf8')), { assetsDir: fs.existsSync(assetsDir) ? assetsDir : undefined });
  errs.forEach((e) => console.error('✗ ' + e));
  console.log(errs.length ? `${errs.length} problem(s) in ${file}` : `✓ ${file} is valid`);
  process.exit(errs.length ? 1 : 0);
}
