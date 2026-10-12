# Using a chat assistant (ChatGPT, Gemini) without installing anything

A web chat assistant can't run commands or save files on your computer. It can still do the interview and write your `event.json`. You run a few commands yourself.

## 1. Get the instructions into the chat

Open `skills/event-intake/SKILL.md` and `template/fields.json` in this repo, copy both, and paste them into a new chat with:

> Follow the instructions in the first file to interview me about my event. The second file lists the holidays and every question to ask, with defaults. Pick my holiday, ask only what is still open, a few questions at a time. When done, give me the complete event.json in one code block.

For a starting example, also paste `template/site/event.json` and say "use this for the shape."

## 2. Answer the questions

Answer in plain language. The assistant should never ask for the street address, gate codes, phone numbers or emails. If it does, skip them; they go in your Google Sheet later.

## 3. Save the result

Make a new empty folder for this event. Copy the code block into a file named `event.json` inside a `.party-lights` folder there (`.party-lights/event.json`).

## 4. Check it yourself

From the event's folder, with Node 20 or newer (`<party-lights>` is where you downloaded this repo):

```bash
node <party-lights>/template/scripts/validate-event.js .party-lights/event.json
```

If it prints problems, paste them back into the chat and ask for a corrected `event.json`. Repeat until it prints no problems.

## 5. Build the app

```bash
node <party-lights>/scripts/new-event.js . --event .party-lights/event.json
```

Then follow `<party-lights>/skills/invite-builder/SKILL.md` (it uses `npm run google`; `npm run host` is an optional Vercel step) and `docs/go-live.md`. You can paste those into the chat too and ask it to explain each step in plain language, but you run the commands and do the Google steps.
