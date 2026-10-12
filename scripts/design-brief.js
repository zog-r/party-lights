// Write <app>/.design-loop.brief.json for the design loop, from the app's event.json + the event type's design_mood.
//   node scripts/design-brief.js --app ../my-event [--look "the host's own words about how it should look"]
const fs = require('node:fs');
const path = require('node:path');

const i = process.argv.indexOf('--app');
if (i < 0 || !process.argv[i + 1]) {
  console.error('usage: node scripts/design-brief.js --app <app dir>');
  process.exit(2);
}
const app = path.resolve(process.argv[i + 1]);
// event.resolved.json carries derived values (when_text); fall back before the first gen run.
const evFile = ['site/event.resolved.json', 'site/event.json'].map((f) => path.join(app, f)).find((f) => fs.existsSync(f));
const ev = JSON.parse(fs.readFileSync(evFile, 'utf8'));
const fields = JSON.parse(fs.readFileSync(path.join(__dirname, '../template/fields.json'), 'utf8'));
const type = fields.event_types.find((t) => t.id === ev.event_type);

const li = process.argv.indexOf('--look');
const look = li >= 0 ? (process.argv[li + 1] || '').trim() : '';
const stock = (type && type.design_mood) || 'Warm, festive, personal.';
const theme = ev.vibe && ev.vibe.theme;
// The host's words lead; the holiday's stock mood is only a fallback so two hosts never start from the same seed.
const mood = [look, theme && `Party theme: ${theme}.`, look ? `Holiday baseline, only where the above is silent: ${stock}` : stock].filter(Boolean).join(' ');

const brief = {
  target: 'site/index.html',
  output_file: 'site/index.html',
  purpose: 'holiday invite site guests open from a text',
  audience: "the host's friends and family, mostly on phones",
  mood,
  must_keep: [ev.title, ev.when_text, ev.area].filter(Boolean),
  constraints: 'keep every id, class, data- attribute, script tag and link that site/app.js and the other pages rely on; no external fonts beyond Google Fonts',
  directions: 3,
  max_iters: 6,
  pass_grade: 9,
  polish: true,
  enrich: 'images',
};
const out = path.join(app, '.design-loop.brief.json');
fs.writeFileSync(out, JSON.stringify(brief, null, 2) + '\n');
console.log(`Wrote ${out}`);
