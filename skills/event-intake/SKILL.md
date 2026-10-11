---
name: event-intake
description: Reference for the describe phase of /party-lights. Use when someone wants to make an invite or RSVP app for a holiday event and needs its event.json. Starts the file from the holiday's defaults, asks only the questions still open, and validates with scripts/validate-event.js.
---

# Describe phase: plain words → event.json

The guided flow is `skills/party-lights/SKILL.md`. This file is the detail for its describe step. The questions, defaults and rules live in `template/fields.json` and the validator, not here. Do not keep your own question list.

## 1. Let them talk first
Invite the host to describe the event in their own words. Pull out everything they already said (holiday, date, who, food, place, overnight stays). Ask nothing twice.

## 2. Start the file
```bash
node scripts/intake.js start --type <id> --out event.json
```
`<id>` is one of `thanksgiving`, `christmas`, `hanukkah`, `kwanzaa`, `nye`, `holiday_party` (see `event_types` in `template/fields.json`). Add `--with <module,module>` for extra modules the host already wants. For a holiday not in the list, use `holiday_party` and set `holiday_name`. Then fill in what the host told you.

## 3. Ask only what is missing
```bash
node scripts/intake.js questions --event event.json [--skip <module,module>]
```
It prints JSON:
- `missing`: fields still open. Ask these, in the host's plain words, at most 3 at a time. Required ones first.
- `maybe_modules`: optional pieces for this holiday (place, stay, rooms, trips...). Ask each one's `ask_if` unless the host already answered it. Pass modules they decided on to `--skip`.
- `ask_extra`: holiday-specific questions worth asking once.
- `agent_fill`: values you work out yourself from other answers (a timezone from the town, for example). Never ask the host for these.

Edit `event.json` with the answers, then run `questions` again. Stop when `missing` is empty.

## 4. Validate
```bash
node template/scripts/validate-event.js ./event.json
```
The validator is the judge, not you. Fix every line it prints. If a rule is wrong for this event, tell the host and change the rule in code.

## 5. Read it back
Summarize in five lines (name, when, where, who stays, food). On a yes:
```bash
node scripts/next.js --mark describe
```

## Mapping notes
- `main` is the headline moment: `start` and `end` are local wall-clock times in `timezone`, formatted `YYYY-MM-DDTHH:MM`.
- `schedule` (when that module is on) needs a row for the main day. Put `link: {label, href}` on a row to point at a page, for example the menu.
- `stay_days` ids are short and lowercase (`fri`, `sat`). Labels are what guests see.
- `food_slots` with the same `meal` render as one course. Ids are lowercase with underscores.
- `title_em` must be the end of `title`. Leave it out if nothing fits.
- Leave `api_url` and `site_url` empty. The google step fills in `api_url`; `site_url` stays blank unless the host self-hosts.
- `images`: only `hero` is required. Keep the placeholders unless the host has photos.
- **Never** put a street address, gate code, phone number or email in event.json. They go in the Sheet's Settings tab later, and only guests who RSVP yes see the address. `area` is a town or neighborhood name.
