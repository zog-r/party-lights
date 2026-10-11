// Push the backend and update the EXISTING web app deployment, so the /exec URL (and every invite link) never changes.
// The deployment ID is read from api_url in site/event.json: https://script.google.com/macros/s/<ID>/exec
const { execSync } = require('node:child_process');
const path = require('node:path');
const event = require('../site/event.json');
const id = (event.api_url.match(/\/macros\/s\/([\w-]+)\/exec/) || [])[1];
if (!id) {
  console.error('Set api_url in site/event.json first (see skills/invite-builder: first deploy).');
  process.exit(1);
}
const gas = path.join(__dirname, '..', 'gas');
execSync('node ../scripts/gen-event.js && npx -y @google/clasp push -f', { cwd: gas, stdio: 'inherit' });
execSync(`npx -y @google/clasp update-deployment ${id}`, { cwd: gas, stdio: 'inherit' });
