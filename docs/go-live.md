# Go live: from a deployed site to real invites

You have an event app (built by `/party-lights:party-lights`), the Sheet is set up (`npm run google`) and the pages are live at your app's Google link (`api_url`). If you are using `/party-lights`, Claude follows this guide for the smoke and invite steps. This guide takes you from there to invites in your guests' hands. Do the steps in order. Each ends with a check; don't move on until it passes.

Replace `<site>` with your invite link: the `api_url` (`https://script.google.com/macros/s/<ID>/exec`) from `site/event.json`. Where this guide shows `<site>/rsvp.html?t=<token>`, use `<site>?page=rsvp&t=<token>`; for `<site>/?t=<token>` use `<site>?t=<token>`; for `<site>/admin.html?k=<admin_key>` use `<site>?page=admin&k=<admin_key>`. (Only if you host the pages yourself on Vercel is `<site>` your own address with the `.html` paths.) Replace `<sheet>` with your Google Sheet, and `<admin_key>` with the `admin_key` value in the Sheet's Settings tab.

## 1. Check where the site lives

Invite emails and texts link to your Google link automatically.

1. Open `<sheet>` → **Settings** tab.
2. Leave `site_url` blank, unless you host the pages yourself on Vercel (`npm run host`); then set it to that address with no trailing slash.

**Check:** `<site>` opens your invite in a browser.

## 2. Fill in the private details

In **Settings** (rows are grouped; the plain-language label is in column B, the code key in grey in column A), set:

- `address`: shown only to guests who RSVP yes.
- `directions`: parking, gate code, arrival notes. Also RSVP-yes only.
- `host_email`: where daily text-digests and notifications go.

**Check:** both are filled in. They never appear in the site's files, only in the Sheet.

## 3. Check the triggers

**Invite app → Set up / repair tabs** already turned on reminders and alerts. (**Install triggers** does the same thing again if they ever stop.) This sets up the daily reminder run and the 5-minute notification sender. Notifications are queued and sent by that trigger, so a host email can take up to 5 minutes to arrive.

**Check:** Apps Script → Triggers (clock icon) lists `dailyRun` (daily) and `flushNotifications` (every 5 minutes).

## 4. Smoke test as a guest (do not skip)

Use a guest row that is you.

1. Guests tab: add a row with your name, email and phone.
2. **Invite app → Generate missing tokens.** A token appears in column A. This only creates tokens; it sends nothing and leaves status blank. Status becomes `invited` only once an invite is actually sent. To test, select your row and run **Email invites to selected rows** (any selected row with an email) or **Text invites to selected rows** (any selected row with a phone; needs `site_url` and `host_email` in Settings). Text invites email you one message of tap-to-text links; they point to the site's `sms.html` because Gmail strips `sms:` links. Both log `invite_sent`. Reload the Sheet if the new menu items don't show.
3. Open `<site>?t=<token>` on your phone. It should greet you by name.
4. Tap **RSVP**, answer yes with a party size, a room request and an arrival day, and submit.
5. You land on the details page (the calendar buttons are here, not on the RSVP page). Confirm the street address and directions show, and that the calendar buttons work.
6. Add the event to your phone's calendar. Check the date, time and time zone.
7. Open the menu page, claim a dish, then remove it.
8. Within 5 minutes, check your inbox for two emails: the host notification (`[<event title>] rsvp`, sent to `host_email`) and the guest "You're in!" email (sent to the guest row's email, with an "Add to calendar & open your invite" button). Both are queued and sent by the 5-minute trigger. The guest email goes out once, on the first yes; changing an RSVP later doesn't resend it.
9. Open `<site>?page=admin&k=<admin_key>`. Your RSVP should show in the stats and table.
10. Paste the invite link into iMessage and WhatsApp. On the Google link the preview is a generic Google card; with Vercel it shows your title and image. (Link previews are cached: a first paste of a bad link can stick, so don't paste the real link anywhere public until this works.)

**Check:** every item above worked. If a page says "This invite is personal", the token is wrong or missing. If a request fails with a Google HTML page, run **Invite app → Set up / repair tabs** once and approve access (see `skills/invite-builder/SKILL.md`).

## 5. Try the failure cases

- Open `<site>?page=rsvp` with no token. It should show the "invite is personal" gate.
- Open `<site>?page=admin&k=wrong`. It should say not authorized.
- RSVP no after yes. The Log tab should record a `cancel`.

## 6. Clear the test data

1. Delete your test row from **Guests**.
2. Delete test rows from **Food**, **Trips** and **Log**.
3. Keep the header row in every tab. Don't delete columns.

**Check:** Guests, Food, Trips and Log hold only headers.

## 7. Add the real guest list

1. Paste names, emails and phones into **Guests**.
2. **Invite app → Generate missing tokens.**
3. Send a first batch to yourself and one friend before everyone (step 8).

## 8. Send invites

Two ways; use either or both.

- **Email:** select the guest rows (any cell in each row), then **Invite app → Email invites to selected rows**. Sent invites are logged as `invite_sent` in the Log tab. Select only rows you haven't sent to yet. Re-sending to a row sends again.
- **Text:** open `<site>?page=admin&k=<admin_key>` on your phone. Each guest has a text button that opens Messages with their personal link ready to send.

Gmail limits free accounts to about 100 emails a day through scripts. Send a larger list across days.

**Check:** the friend receives the invite, the link greets them by name, and their RSVP shows in admin.

## 9. After invites go out

- Watch RSVPs in the admin page or the Guests tab. Set `assigned_room` by hand in the Sheet.
- Reminders run by themselves from the trigger, at the days set in `event.json` → `reminders`. To rehearse one, run `dailyRun('YYYY-MM-DD')` from the Apps Script editor.
- Change copy: edit `site/event.json`, then `npm run gen`, then `npm run deploy`. This also refreshes the pages. (If you host on Vercel, run `npm run host` as well.)
- Change backend code: `npm run deploy`. It updates the same deployment, so links already sent keep working. Never create a second deployment.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Page loads but RSVP does nothing | `api_url` in `event.json` is wrong, or the deployment isn't "Anyone" access |
| API returns an HTML page instead of JSON | The owner hasn't authorized scopes yet (run any Invite app menu item once) |
| Invite links go to the wrong place | `site_url` is set to something wrong; blank it unless you self-host (no trailing slash) |
| No host notification | Wait 5 minutes; check the Log tab's `notified` column and that triggers are installed |
| Link preview is a generic Google card | Expected on the Google link. For your own title and image, host the pages on Vercel (`npm run host`) |

When the smoke test passes, tell Claude and it records the step (`next.js --mark smoke`, then `--mark invite` when the invites are out).
