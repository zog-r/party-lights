# Contributing to Party Lights

Thanks for your interest in contributing.

## Ground rules

- Open an issue before a large change so we can align on approach.
- Keep pull requests focused — one logical change per PR.
- Match the existing code style; no new dependencies without discussion.
- Include a test or a runnable check for any non-trivial logic.

## Development

```bash
git clone https://github.com/zog-r/party-lights.git
cd party-lights
npm test        # scripts, template backend, validator, and a new event end to end (Node 20+, no installs)
```

## Repo tour

```
template/             the event app that gets copied for each host
  fields.json         the field registry: holidays, modules, questions, defaults
  event.schema.json   what an event is (checked by scripts/validate-event.js)
  site/               static pages; all event copy comes from site/event.json
  gas/                Google Apps Script JSON API; the Sheet is the database
  scripts/            dev-api.js (local backend), gen-event.js, deploy.js,
                      google-setup.js (npm run google), host.js (npm run host, optional Vercel)
scripts/              tools for this repo, not the app
  next.js             says which step the host is on and what to do next
  intake.js           starts event.json from a holiday and lists open questions
  new-event.js        creates the app folder (npm run new)
  design-brief.js     writes the brief for the design loop
  vendor.js           copies pinned third-party skills in
skills/               plain-Markdown instructions
  party-lights            the guided workflow (/party-lights)
  event-intake, invite-builder, distill   phase references
  design-loop, cool-uncle-shades, markup  vendored, do not edit by hand
recipes/              how each piece was built, and the gotchas
docs/                 go-live.md, chat-only.md
```

Order of work lives in code (`scripts/next.js`). The `party-lights` skill only narrates it.

How the app works:

- The site calls the Apps Script web app with `Content-Type: text/plain` POSTs, so there is no CORS preflight.
- `event.json` is the single config. `npm run gen` bakes it into the backend and each page's title and link-preview tags.
- Notifications are queued and sent by a 5-minute trigger, never in the request path.
- `npm run deploy` always updates the same deployment, so invite links never change.

### Vendored skills

`skills/design-loop`, `skills/cool-uncle-shades`, `skills/markup` and `agents/polish.md` are pinned copies from other repos. The pins are in `vendor.json` and the list is in [THIRD_PARTY.md](THIRD_PARTY.md). To change them, edit the source repo, bump the commit in `vendor.json`, then:

```bash
node scripts/vendor.js           # copy the pinned versions in
node scripts/vendor.js --check   # confirm the copies are untouched
```

## Where changes go

- Code any event would want goes in `template/`. Anything event-specific goes in `event.json` (and `template/event.schema.json` if it's a new field).
- Lessons and gotchas go in `recipes/`.
- Never commit real guest data, addresses, photos of real places, or Apps Script / Sheet IDs.

## Reporting bugs

Use the issue templates. Include reproduction steps, expected vs. actual
behavior, and your environment (OS, runtime version).

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
By participating you agree to uphold it.
