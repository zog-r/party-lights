---
name: party-lights
description: Use when the user types "/party-lights", says "I'm hosting...", or asks to "make an invite for my party" (Thanksgiving, Christmas, NYE, any holiday gathering). Walks a non-technical host from a plain description of the event to a live invite site, a Google Sheet guest list, and sent invites.
---

# Party Lights: from "I'm hosting" to invites sent

The order of work lives in code. You narrate and do the work.

## The loop
1. Run `node scripts/next.js --json` from the party-lights folder.
2. Say the card in plain, warm words: "Step N of 9: title", the `why`, then what happens. No jargon, no file names.
3. Do the phase (below). Re-run. Repeat until `phase` is `done`.

Run every command in `run` yourself. Give each `host_run` command as its own single-command ```bash block so the host can press Run. Print `links` as markdown links. Interactive sign-ins (`clasp login`, and `vercel login` if opted in) go in a Terminal tab when you have a terminal tool, so the URL shows and the browser opens.

Only stop for: a real gap in the event, the design pick, approve, and sign-ins or Google approval clicks (those are the host's; never click Google approvals). Batch questions, at most 3 at a time, plain words (AskUserQuestion when available). Tone: warm, short, a cool uncle: offer, don't dictate.

## Phases
- **doctor**: only node blocks. Mention the design extras (python3, Chrome, claude CLI) when the host wants the design step.
- **describe**: invite them to describe the event freely first. Start `node scripts/intake.js start --type <id> --out event.json`, fill in what they said, then `node scripts/intake.js questions --event event.json --skip <modules already decided>` and ask only those gaps (`agent_fill` items like timezone you fill yourself). Never put a street address, gate code, phone or email in event.json; those go in the Sheet later. Read it back in 5 lines; on yes, `node scripts/next.js --mark describe`.
- **build**: `npm run new -- ../<slug> --event ./event.json`, then `npm test` in the app. Fix anything red.
- **design**: offer a custom look or the default. Default: `node scripts/next.js --mark design=skipped`. Custom: `node scripts/design-brief.js --app <app>`, then follow `skills/design-loop/SKILL.md` from the app folder (loop.py is `<party-lights>/skills/design-loop/scripts/loop.py`). Show desktop and mobile shots per direction for the host to pick; after the pick, run headless to the stop decision. Then carry the winning look into `site/styles.css` so every page matches, and run `npm test`.
- **review**: start `npm run dev` and `npm run serve` in the app. Read `skills/cool-uncle-shades/SKILL.md` and judge index, rsvp and menu at the local URLs. Show the verdict, offer to apply its "one move", then `--mark review=<avg>`.
- **approve**: give the preview links. If `mcp__Claude_Browser__*` tools exist, open the preview and follow `skills/markup/SKILL.md` (host clicks and annotates, you apply, `npm test`, repeat). Otherwise take edits in chat. On "looks good": `--mark approve`.
- **google**: run `npm run google` in the app and guide each exit (exit 2 means sign-in needed). Host does the sign-in, the API toggle and the Sheet's "Set up / repair tabs" approval. Walk them through it click by click, and warn them before they see it: Google shows "Google hasn't verified this app"; they click Advanced → "Go to <event> (unsafe)" → Allow. It's their own script running only in their account. Then `--mark sheet`.
- **publish**: default (Google): nothing to deploy; `next.js` checks that the `api_url` link opens the event. Hand the host that link, and say guest links get `?t=<token>` from the Sheet's invite buttons. Vercel is only an optional upgrade (nicer link previews, no Google banner): if the host asks, `--mark hosting=vercel`, then `npm run host` in the app (exit 2 means Vercel sign-in) and paste the printed `site_url` into the Sheet's Settings. `--unmark hosting` goes back.
- **smoke**: follow the smoke steps in `docs/go-live.md` with the host's own guest row on the live URL. Markup works here too. Then `--mark smoke`.
- **invite**: walk the Sheet: add guests, Generate missing tokens, address in Settings, send invites (`docs/go-live.md` steps 2-8). Then `--mark invite`.
- **done**: say the event lives in the Sheet: add guests, send invites, watch RSVPs there; `npm run deploy` in the app for later edits.

Out of order or stuck? `node scripts/next.js --unmark <phase>` re-opens a phase.
