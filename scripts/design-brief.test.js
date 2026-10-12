const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function brief(extraArgs) {
  const app = fs.mkdtempSync(path.join(os.tmpdir(), 'brief-'));
  fs.mkdirSync(path.join(app, 'site'));
  fs.writeFileSync(path.join(app, 'site/event.json'), JSON.stringify({ title: 'Friendsgiving', event_type: 'thanksgiving', vibe: { theme: 'Ugly sweaters' } }));
  execFileSync('node', [path.join(__dirname, 'design-brief.js'), '--app', app, ...extraArgs], { stdio: 'ignore' });
  return JSON.parse(fs.readFileSync(path.join(app, '.design-loop.brief.json'), 'utf8')).mood;
}

test('the host\'s own words lead the mood; the holiday default is only a fallback', () => {
  const mood = brief(['--look', 'Moody, plum and brass, like a jazz bar']);
  assert.ok(mood.startsWith('Moody, plum and brass'));
  assert.match(mood, /Party theme: Ugly sweaters/);
  assert.match(mood, /Holiday baseline/);
});

test('without --look the holiday default is the mood', () => {
  assert.match(brief([]), /^Party theme: Ugly sweaters\. /);
});
