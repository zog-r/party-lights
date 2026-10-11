const test = require('node:test');
const assert = require('node:assert/strict');
const { stableUrl } = require('./host.js');

const inspect = (aliases) => `> Fetched deployment "site-k3j9x2m4q-acme.vercel.app" in acme
  General
    name    site
    url     https://site-k3j9x2m4q-acme.vercel.app
  Aliases
${aliases.map((a) => `    ╶ ${a}`).join('\n')}
  Builds
    ╶ . [0ms]
`;

test('stableUrl picks the hash-free project alias', () => {
  assert.equal(stableUrl(inspect(['https://site-k3j9x2m4q-acme.vercel.app', 'https://site-git-main-acme.vercel.app', 'https://site-seven-mu.vercel.app'])), 'https://site-seven-mu.vercel.app');
  assert.equal(stableUrl(inspect(['https://site-acme.vercel.app', 'https://site-k3j9x2m4q-acme.vercel.app'])), 'https://site-acme.vercel.app');
});

test('stableUrl ignores the deployment URL outside Aliases and returns null with no alias', () => {
  assert.equal(stableUrl(inspect([])), null);
  assert.equal(stableUrl(inspect(['https://site-k3j9x2m4q-acme.vercel.app'])), null);
});
