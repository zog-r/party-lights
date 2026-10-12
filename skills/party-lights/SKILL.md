---
name: party-lights
description: Use when the user types "/party-lights", says "I'm hosting...", or asks to "make an invite for my party" (Thanksgiving, Christmas, NYE, any holiday gathering). Walks a non-technical host from a plain description of the event to a live invite site, a Google Sheet guest list, and sent invites.
---

# Party Lights: from "I'm hosting" to invites sent

The order of work lives in code. You narrate and do the work.

Party Lights is a plugin: it stays where it is installed (`${CLAUDE_PLUGIN_ROOT}`) and is never written to. Each event gets a folder of its own, the working directory, which becomes that event's invite app. Its `.party-lights/` holds the event's state and draft `event.json`, so any number of events can use one install. Every command below runs from the event's folder. If it already has other things in it, `next.js` says so: have the host make a new empty folder and start Claude there.

## The loop
1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/next.js" --json` from the event's folder.
2. Say the card in plain, warm words: "Step N of 9: title", the `why`, then what happens. No jargon, no file names.
3. Do the phase (below). Re-run. Repeat until `phase` is `done`.

Run every command in `run` yourself. Give each `host_run` command as its own single-command ```bash block so the host can press Run. Print `links` as markdown links. Interactive sign-ins (`clasp login`, and `vercel login` if opted in) go in a Terminal tab when you have a terminal tool, so the URL shows and the browser opens.

Only stop for: a real gap in the event, the design pick, approve, and sign-ins or Google approval clicks (those are the host's; never click Google approvals). Batch questions, at most 3 at a time, plain words (AskUserQuestion when available). Tone: warm, short, a cool uncle: offer, don't dictate.

Never point the host at a file, field name, or JSON. Edits go through chat (tell Claude what to change; you update it here and redeploy) or the Sheet.

## Phases
- **doctor**: only node blocks. Mention the design extras (python3, Chrome, claude CLI) when the host wants the design step.
- **describe**: invite them to describe the event freely first. Start `node "${CLAUDE_PLUGIN_ROOT}/scripts/intake.js" start --type <id> --out .party-lights/event.json`, fill in what they said, then `node "${CLAUDE_PLUGIN_ROOT}/scripts/intake.js" questions --event .party-lights/event.json --skip <modules already decided>` and ask only those gaps (`agent_fill` items like timezone you fill yourself). Never put a street address, gate code, phone or email in event.json; those go in the Sheet later. Read it back in 5 lines; on yes, `node "${CLAUDE_PLUGIN_ROOT}/scripts/next.js" --mark describe`.
- **build**: `node "${CLAUDE_PLUGIN_ROOT}/scripts/new-event.js" . --event .party-lights/event.json`, then `npm test`. Fix anything red.
- **design**: every invite gets its own look, on every page. The template is the plumbing (Sheet wiring, RSVP, menu and claim logic, `app.js` calls, the ids, `data-*` attributes and form names the scripts use); it is a fallback, never the default look. Ask the host how it should feel (colors, mood, anything they have seen and liked; one question, plain words), then `node "${CLAUDE_PLUGIN_ROOT}/scripts/design-brief.js" --app . --look "<their words, verbatim>"`. The brief's `pages` lists every guest page this event's modules turn on, each with the hooks it must keep. Follow `${CLAUDE_PLUGIN_ROOT}/skills/design-loop/SKILL.md` from this folder (loop.py is `${CLAUDE_PLUGIN_ROOT}/skills/design-loop/scripts/loop.py`). Show desktop and mobile shots per direction for the host to pick; after the pick, run headless to the stop decision. Then re-compose every page in `pages` in the winning direction: layout, section order, components and copy voice, not only colors and fonts, with `site/styles.css` shared. Judge which optional extras fit this event (an interactive menu, a schedule, a day-trips page) instead of including the same set every time, and tell the host what you added or left out. The confirmation and reminder emails show the file `images.hero.src` points at, so when the new hero is CSS, video or drawn in markup, render it to a still (screenshot the hero) and save it over that file in `site/assets/` (and its `alt`); never leave the starter placeholder. Markup may change freely; the hooks may not: run `node "${CLAUDE_PLUGIN_ROOT}/scripts/check-hooks.js" --app .` and fix what it lists (hooks and the hero picture), then `npm test`. Keeping the plain starter look is the host's opt-out, never your suggestion: `node "${CLAUDE_PLUGIN_ROOT}/scripts/next.js" --mark design=skipped`. If python3, Chrome or the claude CLI are missing, help install them first.
- **review**: start `npm run dev` and `npm run serve`. Read `${CLAUDE_PLUGIN_ROOT}/skills/cool-uncle-shades/SKILL.md` and judge index, rsvp and menu at the local URLs. Show the verdict, offer to apply its "one move", then `--mark review=<avg>`.
- **approve**: give the preview links. If `mcp__Claude_Browser__*` tools exist, open the preview and follow `${CLAUDE_PLUGIN_ROOT}/skills/markup/SKILL.md` (host clicks and annotates, you apply, `npm test`, repeat). Otherwise take edits in chat. On "looks good": `--mark approve`.
- **google**: run `npm run google` and guide each exit (exit 2 means sign-in needed). Host does the sign-in, the API toggle and the Sheet's "Set up / repair tabs" approval. Walk them through it click by click, and warn them before they see it: Google shows "Google hasn't verified this app"; they click Advanced → "Go to <event> (unsafe)" → Allow. It's their own script running only in their account. Then `--mark sheet`.
- **publish**: default (Google): nothing to deploy; `next.js` checks that the `api_url` link opens the event. Hand the host that link, and say guest links get `?t=<token>` from the Sheet's invite buttons. Vercel is only an optional upgrade (nicer link previews, no Google banner): if the host asks, `--mark hosting=vercel`, then `npm run host` (exit 2 means Vercel sign-in) and paste the printed `site_url` into the Sheet's Settings. `--unmark hosting` goes back.
- **smoke**: follow step 4 of `${CLAUDE_PLUGIN_ROOT}/docs/go-live.md` with the host's own guest row, in order: add the row (name, email, phone), Generate missing tokens, select the row, Email invites to selected rows, open the link from that email (not a Sheet button), RSVP yes, check the address shows and the alert arrives within 5 minutes. Markup works here too. Then `--mark smoke`.
- **invite**: walk the Sheet: add guests, Generate missing tokens, address in Settings, send invites (`${CLAUDE_PLUGIN_ROOT}/docs/go-live.md` steps 2-8). Then `--mark invite`.
- **done**: say the event lives in the Sheet: add guests, send invites, watch RSVPs there; for later edits the host tells you what to change and you update the site and run `npm run deploy`.

Out of order or stuck? `node "${CLAUDE_PLUGIN_ROOT}/scripts/next.js" --unmark <phase>` re-opens a phase.
