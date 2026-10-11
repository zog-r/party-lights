const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDeploymentId } = require('./google-setup.js');

const ID = 'AKfycbxAbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_abc';

test('parseDeploymentId reads clasp output and skips @HEAD', () => {
  assert.equal(parseDeploymentId(`2 Deployments.\n- AKfycbyHeadHeadHeadHeadHeadHead012345 @HEAD\n- ${ID} @3 - web app\n`), ID);
  assert.equal(parseDeploymentId(`Created version 1.\n- ${ID} @1 - web app`), ID);
  assert.equal(parseDeploymentId('- some-other-id-with-dashes_12345 @2 - web app'), 'some-other-id-with-dashes_12345');
});

test('parseDeploymentId returns null when there is no versioned deployment', () => {
  // Real clasp output: ids can end in '-'.
  assert.equal(parseDeploymentId('Deployed AKfycbxFakeFakeFakeFakeFakeFakeFakeFakeFakeFakeFake0123- @1'), 'AKfycbxFakeFakeFakeFakeFakeFakeFakeFakeFakeFakeFake0123-');
  assert.equal(parseDeploymentId('1 Deployment.\n- AKfycbyHeadHeadHeadHeadHeadHead012345 @HEAD\n'), null);
  assert.equal(parseDeploymentId(''), null);
});
