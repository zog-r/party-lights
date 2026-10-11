// Registry-driven interview helper for the host's event.json.
//   node scripts/intake.js start --type <id> [--with <module,module>] [--out event.json]
//   node scripts/intake.js questions --event <file> [--skip <module,module>]
// `start` writes a starter event.json from the holiday's defaults in template/fields.json. `questions` prints, as JSON,
// only what still needs the host (never ask:false, derived, filled-in, or off-module fields). Ask exactly that, nothing more.
const fs = require('node:fs');
const path = require('node:path');
const { modulesOn, isMissing, registry } = require('../template/scripts/validate-event.js');

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : undefined; };
const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
const fail = (msg) => { console.error(msg); process.exit(2); };

function start() {
  const type = registry.event_types.find((t) => t.id === flag('type'));
  if (!type) fail(`--type must be one of: ${registry.event_types.map((t) => t.id).join(', ')}`);
  const out = path.resolve(flag('out') || 'event.json');
  if (fs.existsSync(out)) fail(`${out} already exists; pick another --out or delete it.`);
  const example = JSON.parse(fs.readFileSync(path.join(__dirname, '../template/site/event.json'), 'utf8'));
  const features = [...new Set([...type.on, ...list(flag('with'))])];
  const unknown = features.filter((id) => !registry.modules.some((m) => m.id === id));
  if (unknown.length) fail(`unknown module(s): ${unknown.join(', ')}`);
  const ev = { event_type: type.id, features, images: { hero: { src: example.images.hero.src, alt: 'Placeholder photo; swap in your own.' } } };
  if (features.includes('reminders')) ev.reminders = example.reminders;
  if (features.includes('menu')) {
    ev.food_slots = [{ id: 'dishes', meal: 'The table', label: 'Dishes', suggestions: type.menu_ideas },
      { id: 'drinks', meal: 'The table', label: 'Drinks', suggestions: [] }];
  }
  if (features.includes('activities')) ev.activity_seeds = type.activity_ideas.map((title) => ({ title }));
  fs.writeFileSync(out, JSON.stringify(ev, null, 2) + '\n');
  console.log(`Wrote ${out}\nNext: node scripts/intake.js questions --event ${flag('out') || 'event.json'}`);
}

function questions() {
  const file = flag('event');
  if (!file || !fs.existsSync(file)) fail('usage: node scripts/intake.js questions --event <file>');
  const ev = JSON.parse(fs.readFileSync(file, 'utf8'));
  const on = modulesOn(ev);
  const missing = [];
  const agentFill = [];
  for (const m of registry.modules.filter((m) => on.has(m.id))) {
    for (const f of m.fields) {
      if (f.where !== 'event.json' || f.ask === false || f.key.includes('*') || !isMissing(ev, f.key)) continue;
      if (f.only_with && !on.has(f.only_with)) continue;
      if (f.derive) {
        if (f.derive_by === 'agent') agentFill.push({ key: f.key, rule: f.derive });
        continue;
      }
      if (!f.required && f.key.includes('[].')) continue; // detail of a list the host answers through its required fields
      const { kind, choices, example } = f;
      missing.push({ module: m.id, key: f.key, label: f.label, question: f.question, required: !!f.required, kind, choices, example });
    }
  }
  missing.sort((a, b) => b.required - a.required);
  const type = registry.event_types.find((t) => t.id === ev.event_type);
  const skip = list(flag('skip'));
  const maybe = (type?.maybe || []).filter((id) => !on.has(id) && !skip.includes(id)).map((id) => {
    const m = registry.modules.find((x) => x.id === id);
    return { id, label: m.label, ask_if: m.ask_if, needs: m.needs || [] };
  });
  console.log(JSON.stringify({ missing, maybe_modules: maybe, ask_extra: type?.ask_extra || [], agent_fill: agentFill }, null, 2));
}

const commands = { start, questions };
if (!commands[args[0]]) fail('usage: node scripts/intake.js start --type <id> | questions --event <file>');
commands[args[0]]();
