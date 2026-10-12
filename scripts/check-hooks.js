// After a redesign: fail if any guest page dropped a hook the template's script relies on.
//   node scripts/check-hooks.js --app .
const path = require('node:path');
const { check, heroUnchanged } = require('../template/scripts/page-hooks.js');

const i = process.argv.indexOf('--app');
const app = path.resolve(i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : '.');
let gone;
try { gone = [...check(app), ...heroUnchanged(app)]; } catch (e) { gone = [e.message]; }
if (gone.length) {
  console.error(`Redesign left something undone:\n  ${gone.join('\n  ')}`);
  process.exit(1);
}
console.log('All page hooks intact, hero replaced.');
