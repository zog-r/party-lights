# Backend recipes: Google Sheet + Apps Script

The Sheet is the database and the admin panel. Apps Script serves a small JSON API that the static site calls.

## Where the pages live
By default Apps Script serves the pages too, so a host needs only a Google account. The web app's `/exec` link is the invite (`?page=rsvp&t=<token>` and so on; the admin page is `?page=admin&k=<admin_key>`). The cost: pages load inside an iframe with a small Google notice, a bit slower, and link previews are a generic Google card. For nicer previews, host the same `site/` folder on a static host (`npm run host` does Vercel) and set Settings `site_url`; the pages then call the Apps Script web app as a JSON API.

## Call it without CORS trouble
POST with `Content-Type: text/plain` and a JSON body. That keeps it a "simple" request, so the browser never sends a preflight that Apps Script can't answer. See `template/site/app.js` → `api()`.

## One config file
`site/event.json` is the only source of truth. Apps Script can't read site files, so `scripts/gen-event.js` bakes it into `gas/event.gen.js` before every push. It also stamps page titles and link-preview tags, and sets the Apps Script time zone.

Apps Script loads files alphabetically, so `Code.js` runs before `event.gen.js`. Don't read `EVENT` at the top level of a file. Read it inside a function or a getter (see `TABS.Guests` in `Code.js`).

## Local dev with no Google account
`template/scripts/dev-api.js` runs the real `gas/*.js` files in a Node `vm` with fake `SpreadsheetApp`, `MailApp`, `UrlFetchApp`, `LockService` and so on. It gives you:
- a local API on `:8787`, seeded with three guests (`test1` yes, `test2` invited, `test3` maybe; admin key `dev`);
- end-to-end tests over the real backend code (`gas/api.test.js`).

Pure logic lives in `gas/logic.js` behind `if (typeof module !== 'undefined') module.exports = …`, so the same file runs in Apps Script and in Node.

Gotcha: arrays created inside the `vm` fail `deepStrictEqual` against host arrays. Round-trip them through JSON first.

## Never do slow work in the request path
Each Apps Script call costs about 2.5 s even for reads. Outbound `UrlFetchApp` calls from Google can take far longer: one push-notification call took ~50 s. So the API only writes a row to the Log tab. A 5-minute trigger (`flushNotifications`) sends the email and push, then stamps the `notified` column. Writes dropped from ~53 s to ~3 s.

Design the UI for a ~2.5 s round trip: show feedback right away.

## Deploy without breaking links
The first deploy creates a web app and its `/exec` URL. Put that URL in `event.json` → `api_url`. After that, `npm run deploy` pushes and then runs `clasp update-deployment <id>` on the **same** deployment, so every invite link already sent keeps working. Never create a second deployment.

The owner must run one Sheet menu item once to authorize scopes. Until then the web app returns a Google HTML page instead of JSON.

## Guest gate
Each guest gets a personal link, `?t=<token>`, generated in the Guests tab. The token is the login. The public invite page works without one; personal pages show a "this invite is personal" gate. The street address is only returned to guests who RSVP'd yes.

## Small gotchas
- `form.title` and `form.slot` are built-in DOM properties. Use `form.elements.<name>`.
- `npx serve` rewrites `*.html` to clean URLs, which breaks nav matching. Ship `site/serve.json` with `{"cleanUrls": false}`.
- Newer Node versions reject `node --test <dir>/`. Pass a glob: `node --test gas/*.test.js`.
