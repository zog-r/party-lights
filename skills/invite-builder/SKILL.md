---
name: invite-builder
description: Reference for the build, google and publish phases of /party-lights. Use when a host has a valid event.json and needs the app created, the Google Sheet backend set up, and the site put online. Also use to redeploy later.
---

# Build, Google, publish

The guided flow is `skills/party-lights/SKILL.md`; `node scripts/next.js` says which step is next. This file is the detail for three of its steps. The host does every sign-in and approval click.

## Build
From the Party Lights folder:
```bash
npm run new -- ../my-event --event ./event.json
cd ../my-event && npm test
```
`npm run new` validates the event and stamps page titles and link previews. It never overwrites a non-empty folder. Tests must pass before you go on.

To look at it locally (no Google account needed):
```bash
npm run dev      # fake backend on :8787, guests test1 / test2 / test3, admin key "dev"
npm run serve    # site on :5173
```
Open `http://localhost:5173/?t=test1` (said yes), `?t=test2` (invited), and `admin.html?k=dev`. Swap in photos (`site/assets/`, see `recipes/media.md`) and edit copy in `site/event.json`. Run `npm test` after each change.

## Google
Say it plainly: "Your guest list lives in a Google Sheet you own. It's free. You approve access once."

1. Host turns on the Apps Script API: https://script.google.com/home/usersettings
2. Host signs in: `cd gas && npx -y @google/clasp login` (a browser opens).
3. In the app folder: `npm run google`.

`npm run google` is safe to re-run. It creates the Sheet and script, pushes the backend, makes the one deployment, writes `api_url` into `site/event.json`, and deploys. If it exits 2, sign-in is missing; do that and run it again.

Then the host opens the Sheet (the command prints its link), reloads, and runs **Invite app → Set up / repair tabs**. Google asks them to approve access once. After that: `node scripts/next.js --mark sheet`.

Fallback if `npm run google` can't read the deployment ID: paste it into `site/event.json` as `"api_url": "https://script.google.com/macros/s/<ID>/exec"` and run `npm run deploy`. For other clasp trouble, trust `npx @google/clasp <cmd> --help`.

## Publish
Apps Script already serves the pages: `npm run google` printed "Your invite site is live". The host's link is `api_url` in `site/event.json`. Guest links are that link plus `?page=rsvp&t=<token>` (the Sheet's invite buttons add them). The host page is that link plus `?page=admin&k=<admin_key from the Sheet's Settings>`. Leave Settings `site_url` blank.

Optional, only if the host asks for nicer link previews and no Google notice:
```bash
npm run host
```
It puts `site/` on Vercel, saves the URL as `site_url` in `site/event.json`, and redeploys once. Exit 2 means the host needs `npx -y vercel login` first. Then the host pastes the printed `site_url` into the Sheet → Settings → `site_url`.

Next: the smoke test and sending invites, in `docs/go-live.md`.

## Redeploying later
`npm run deploy` in the app folder pushes the backend and updates the **same** deployment, so links already sent keep working. Never create a second deployment.
