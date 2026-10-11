# Party Lights

If you have a Google account, Party Lights builds your own custom event app, managed from a spreadsheet, from plain-language input.

Tell Claude about your holiday gathering in plain words. It builds the invite pages, puts the guest list in a Google Sheet you own, runs everything on your own Google account, and walks you through sending the invites.

## What you get

- An invite page with a link for each guest that greets them by name.
- RSVPs, with party size, arrival days and (if you want it) room requests.
- Add-to-calendar buttons for Google and Apple calendars.
- A potluck menu where guests claim a dish.
- A guest list, and reminders by email or text.
- A Google Sheet you own. It holds your guests, their answers and your settings. You run the event from it.

## Holidays

Thanksgiving / Friendsgiving, Christmas, Hanukkah, Kwanzaa, New Year's Eve, and a general holiday party for anything else.

## What you need

- A Google account.
- The Claude desktop app (Code tab), or Claude Code.
- Node 20 or newer. Get it at https://nodejs.org, or `brew install node` on a Mac.
- About 30 to 45 minutes.

Only if you want a custom look: Python 3 and Google Chrome.

The pages, the guest list and the backend all run on your Google account. You need no other account.

Two honest trade-offs: guest pages show a small Google notice at the top, and link previews in iMessage and WhatsApp show a generic Google card instead of your title and photo.

### Optional: host the pages yourself

If you want nicer link previews and no Google notice, you can put the pages on Vercel (a free account) with `npm run host`. Ask Claude for it, or skip it.

## Install

1. Download this folder (or `git clone https://github.com/zog-r/party-lights`).
2. Open the folder in the Claude desktop app (Code tab) or in Claude Code.

## Usage

Type `/party-lights` and describe your event in your own words, for example:

```text
/party-lights I'm hosting Friendsgiving on Saturday, November 21 in Denver. About 15 people, potluck style, kids welcome.
```

Claude does the rest, one step at a time. You pick the look, check a preview, and say when it looks good.

## What you do yourself

Claude can't do these for you:

- Sign in to Google.
- Approve access once in your Sheet. Google will warn "Google hasn't verified this app". That's expected: the script is yours and only runs in your account. Click **Advanced**, then **Go to (your event) (unsafe)**, then **Allow**.
- Press Run on a few commands Claude shows you.

## Privacy

Your street address, gate code, phone number and email never go in the site's files. They live in your Sheet. Only guests who RSVP yes see the address.

## For contributors

How it works inside, and how to change it: [CONTRIBUTING.md](CONTRIBUTING.md).

## Built with

Party Lights bundles pinned copies of three open-source Claude tools, so there's nothing extra to install:

- [wildling-design-loop](https://github.com/zog-r/wildling-design-loop): the custom-look step. It designs a few directions, you pick one, then it refines the page.
- [cool-uncle](https://github.com/zog-r/cool-uncle): the last check before your site goes live, judging whether it nudges guests instead of nagging them.
- [markup](https://github.com/zog-r/markup): click on your preview and type what to change.

Want them in your other projects too? Install them from their repos. Versions and licenses: [THIRD_PARTY.md](THIRD_PARTY.md).

## License

MIT. See [LICENSE](LICENSE).
