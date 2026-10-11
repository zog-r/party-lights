const test = require('node:test');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('vendored files match vendor.json lock', () => {
  execFileSync('node', [path.join(__dirname, 'vendor.js'), '--check'], { stdio: 'pipe' });
});
