#!/usr/bin/env node
// Copies pinned files from other repos (vendor.json) into this one.
//   node scripts/vendor.js          copy at the pinned commits, apply patches, rewrite the lock
//   node scripts/vendor.js --check  verify on-disk copies match the lock
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const manifestPath = path.join(root, 'vendor.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] });

function check() {
  const bad = [];
  for (const [file, hash] of Object.entries(manifest.lock || {})) {
    const p = path.join(root, file);
    if (!fs.existsSync(p)) bad.push(`${file}: missing`);
    else if (sha(fs.readFileSync(p)) !== hash) bad.push(`${file}: changed since it was vendored`);
  }
  if (!Object.keys(manifest.lock || {}).length) bad.push('vendor.json has no lock; run: node scripts/vendor.js');
  if (bad.length) {
    console.error('Vendored files do not match vendor.json:\n  ' + bad.join('\n  ') + '\nTo restore them: node scripts/vendor.js');
    process.exit(1);
  }
  console.log(`vendor ok (${Object.keys(manifest.lock).length} files)`);
}

function source(entry, tmpDirs) {
  const sibling = path.join(root, '..', entry.local || '');
  if (entry.local && fs.existsSync(sibling)) {
    try { git(sibling, 'cat-file', '-e', `${entry.commit}^{commit}`); return sibling; } catch (e) { /* fall through to clone */ }
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-'));
  tmpDirs.push(dir);
  execFileSync('git', ['clone', '--quiet', entry.repo, dir], { stdio: 'inherit' });
  git(dir, 'cat-file', '-e', `${entry.commit}^{commit}`);
  return dir;
}

function vendor() {
  const lock = {};
  const tmpDirs = [];
  try {
    for (const entry of manifest.entries) {
      const src = source(entry, tmpDirs);
      const out = new Map();
      for (const { from, to } of entry.files) {
        if (from.endsWith('/')) {
          const names = git(src, 'ls-tree', '-r', '--name-only', entry.commit, '--', from).toString().split('\n').filter(Boolean);
          if (!names.length) throw new Error(`${entry.name}: nothing at ${from}`);
          for (const n of names) out.set(to + n.slice(from.length), git(src, 'show', `${entry.commit}:${n}`));
        } else {
          out.set(to, git(src, 'show', `${entry.commit}:${from}`));
        }
      }
      for (const { file, find, replace } of entry.patches) {
        if (!out.has(file)) throw new Error(`${entry.name}: patch targets unknown file ${file}`);
        const text = out.get(file).toString('utf8');
        if (!text.includes(find)) throw new Error(`${entry.name}: patch text not found in ${file}`);
        out.set(file, Buffer.from(text.split(find).join(replace)));
      }
      for (const [file, buf] of out) {
        const p = path.join(root, file);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, buf);
        lock[file] = sha(buf);
        console.log(`${entry.name}@${entry.commit}  ${file}`);
      }
    }
  } finally {
    for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  }
  manifest.lock = Object.fromEntries(Object.entries(lock).sort());
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}

if (process.argv.includes('--check')) check();
else vendor();
