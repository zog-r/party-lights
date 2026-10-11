// Put the site online with Vercel, record the URL in site/event.json (link previews), and redeploy once so they pick it up.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');

const app = path.join(__dirname, '..');
const eventFile = path.join(app, 'site/event.json');

// `vercel inspect` lists the deployment's aliases. Pick the *.vercel.app one with no per-deployment hash
// (hash hosts look like name-abc123xyz-team.vercel.app) and no branch alias (-git-): that one never changes.
function stableUrl(inspectOut) {
  const section = String(inspectOut).split(/^\s*Aliases\b.*$/m)[1] || '';
  const hosts = (section.match(/https:\/\/[\w.-]+\.vercel\.app/g) || [])
    .filter((u) => !/-[a-z0-9]{9}-[\w-]+\.vercel\.app$/.test(u) && !/-git-/.test(u));
  return hosts.sort((a, b) => a.length - b.length)[0] || null;
}

async function resolveStable(deployUrl) {
  const r = spawnSync('npx', ['-y', 'vercel', 'inspect', deployUrl], { cwd: app, encoding: 'utf8' });
  const found = stableUrl((r.stdout || '') + (r.stderr || ''));
  if (found) return found;
  let name = 'site';
  for (const dir of [app, path.join(app, 'site')]) {
    try { name = JSON.parse(fs.readFileSync(path.join(dir, '.vercel/project.json'), 'utf8')).projectName || name; break; } catch { /* not there */ }
  }
  const guess = `https://${name}.vercel.app`;
  try { if ((await fetch(guess, { signal: AbortSignal.timeout(8000) })).status === 200) return guess; } catch { /* unverified */ }
  return null;
}

function deploy() {
  const r = spawnSync('npx', ['-y', 'vercel', 'deploy', 'site', '--prod', '--yes'], { cwd: app, encoding: 'utf8' });
  process.stderr.write(r.stderr || '');
  if (r.status !== 0) {
    if (/log ?in|credentials|not authenticated|no existing credentials/i.test(r.stderr + r.stdout)) {
      console.log('Sign in to Vercel first (opens a browser):\n\n  npx -y vercel login\n\nThen run `npm run host` again.');
      process.exit(2);
    }
    process.exit(r.status || 1);
  }
  const urls = (r.stdout.match(/https:\/\/[\w.-]+\.vercel\.app/g) || []);
  if (!urls.length) { console.log('Deployed, but no URL found in the output. Put your site URL in site/event.json as site_url, then npm run gen.'); process.exit(1); }
  return urls[urls.length - 1].replace(/\/$/, '');
}

module.exports = { stableUrl };
if (require.main === module) (async () => {
  const deployed = deploy();
  const url = await resolveStable(deployed);
  if (!url) {
    console.log(`Deployed to ${deployed}, but I could not find the stable address. That link changes with every deploy.\nFind your project's own *.vercel.app address in the Vercel dashboard, put it in site/event.json as site_url, then run npm run gen and npm run deploy.`);
    process.exit(1);
  }
  const ev = JSON.parse(fs.readFileSync(eventFile, 'utf8'));
  ev.site_url = url;
  fs.writeFileSync(eventFile, JSON.stringify(ev, null, 2) + '\n');
  execFileSync('npm', ['run', 'gen'], { cwd: app, stdio: 'inherit' });
  deploy();
  console.log(`\nLive at ${url}\nPut this in the Sheet > Settings > site_url: ${url}`);
})();
