const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '../template', f), 'utf8'));
const reg = read('fields.json');
const ids = reg.modules.map((m) => m.id);

test('module ids are unique and event types only name real modules', () => {
  assert.equal(new Set(ids).size, ids.length);
  for (const t of reg.event_types) {
    for (const id of [...t.on, ...t.maybe]) assert.ok(ids.includes(id), `${t.id}: unknown module "${id}"`);
    for (const m of reg.modules.filter((m) => m.always)) assert.ok(t.on.includes(m.id), `${t.id}: always-on module "${m.id}" missing from on`);
  }
});

test('"needs" points at real modules', () => {
  for (const m of reg.modules) for (const n of m.needs || []) assert.ok(ids.includes(n), `${m.id} needs unknown "${n}"`);
});

test('every event.json field in the schema is covered by a registry field', () => {
  const covered = new Set(reg.modules.flatMap((m) => m.fields).map((f) => f.key.split(/[.[]/)[0]));
  // site_url/api_url are filled in by invite-builder; features is derived from the chosen holiday's modules. None are asked.
  const skip = new Set(['$schema', 'site_url', 'api_url', 'features']);
  for (const k of Object.keys(read('event.schema.json').properties)) {
    if (!skip.has(k)) assert.ok(covered.has(k), `schema field "${k}" has no entry in fields.json`);
  }
});

test('event_type in the schema lists exactly the registry\'s holidays, and the example event only uses real modules', () => {
  assert.deepEqual(read('event.schema.json').properties.event_type.enum, reg.event_types.map((t) => t.id));
  assert.ok(read('site/event.json').features.every((id) => ids.includes(id)));
});

test('registry properties the tools read are well formed', () => {
  for (const f of reg.modules.flatMap((m) => m.fields)) {
    if (f.derive) assert.ok(['code', 'agent'].includes(f.derive_by), `${f.key}: derive needs derive_by "code" or "agent"`);
    if (f.only_with) assert.ok(ids.includes(f.only_with), `${f.key}: only_with names unknown module "${f.only_with}"`);
    assert.ok(!f.ask === (f.ask === false) || f.ask === undefined, `${f.key}: ask is only ever false`);
    assert.ok(!(f.ask === false && f.required && !f.derive), `${f.key}: required but never asked and not derived`);
  }
});

test('review notes are resolved into properties; only open questions remain as notes', () => {
  const notes = reg.modules.flatMap((m) => m.fields).filter((f) => f.note).map((f) => f.key);
  assert.deepEqual(notes.sort(), ['holiday_name', 'images.hero']);
});

test('no event type lists a menu idea twice', () => {
  for (const t of reg.event_types) {
    const lower = t.menu_ideas.map((x) => x.toLowerCase());
    assert.equal(new Set(lower).size, lower.length, `${t.id} repeats a menu idea`);
  }
});
