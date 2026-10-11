# Design recipes

## The dusk system (template default)
Everything lives in `template/site/styles.css`:
- **Tokens:** `--pine` ground, `--linen` text, `--mist` secondary, `--frost` meta, `--hair` hairline rules. `--glow` amber is only for the primary button and the one hero italic per page.
- **Type:** a serif (Fraunces) for display and body text. A small sans (Instrument Sans) only for tracked caps: labels, meta, buttons, nav.
- **Layout:** one 1180 px column. Sections sit under hairline rules instead of in floating cards. Buttons are squared (2 px radius). Choices are squared toggles, and `.choices.seg` joins them into one segmented control. Fields are underline-only.
- **Menu:** potluck dishes are plates on a table photo (`images.feature`).

Keep page-specific class names out of the shared names (`.plate` and `.day` both collided once). The shared sheet also sets `[hidden] { display: none !important }`, so a `display: grid` rule can't un-hide a section.

## Running a design loop on the landing page
If you use an automated critic loop (generate a direction, score it with a blind critic in a fresh process, iterate):
- **Let the host pick the direction by hand.** Automated judging of first directions picks safe, generic ones.
- A real inline RSVP form beat "three buttons that lead nowhere".
- Critics that see only a screenshot a moment after load can't see timed effects (a video fading into a still). They score the first frame. Capture a settled-state screenshot if the page animates.
- Scores wobble about ±0.4 between rounds, and pairwise wins often disagree with scores. Look at the trend, not one round.
- Anything borrowed from moodboard images gets flagged as "lifted from the reference". The critic sees the moodboard too.
- When patching HTML with scripts, assert the search string is non-empty and present. An empty match silently inserts at the start of the file.
