# Party Lights: instructions for AI agents

This repo turns a host's description of a holiday event into an invite app (RSVPs, calendar links, potluck menu, guest list, reminders): a static site with a Google Sheet as the database. Read `README.md` for the overview.

The instructions live in `skills/`. They are plain Markdown and are the single source of truth. Read the matching file and follow it; do not rely on a copy here.

| When the user wants to... | Read |
|---|---|
| Make an event or invite app (this is the default) | `skills/party-lights/SKILL.md`. Start with `node scripts/next.js` |
| Describe phase detail: build `event.json` | `skills/event-intake/SKILL.md` |
| Build, Google and publish phase detail | `skills/invite-builder/SKILL.md` |
| Port improvements from a real event back into this template | `skills/distill/SKILL.md` |

`scripts/next.js` decides which step the host is on. The two phase files are references for it. After deploying, `docs/go-live.md` covers the end-to-end test and sending invites. `recipes/` explains how each piece was built.

## Commands (run from the repo root)

- `node scripts/next.js [--json]` shows the current step. `--mark <phase>[=value]` records one as done, `--unmark <phase>` re-opens it.
- `node scripts/intake.js start --type <id> --out event.json` starts an `event.json` from a holiday. `node scripts/intake.js questions --event event.json [--skip <modules>]` lists what is still missing.
- `node template/scripts/validate-event.js ./event.json` checks an `event.json`.
- `npm run new -- ../my-event --event ./event.json` creates the app folder.
- `npm test` checks the scripts, the template, the validator, and that a new event builds.
- Inside the new app folder: `npm run dev` (local backend), `npm run serve` (site), `npm run google` (create the Sheet and backend), `npm run deploy` (push the backend and pages; always the same deployment). The pages are served by Apps Script at the app's `/exec` link. `npm run host` is optional: it puts the pages on Vercel for nicer link previews (then Settings `site_url` is set; otherwise leave it blank).

## Rules

- Never put a street address, gate code, phone number or email in `event.json`. Those go in the Sheet's Settings tab.
- The Google sign-in (and Vercel's, if the host opts in) and the Google approval clicks are the host's to do.
- The admin page is `<exec url>?page=admin&k=<admin_key from the Sheet's Settings>`.

## No shell or file access?

If you are a chat assistant that cannot run commands or write files, follow `docs/chat-only.md`.
