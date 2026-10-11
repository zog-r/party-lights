# Media recipes

## Native resolution only
Phone video usually exports at 720 px wide. Stretched full-bleed on a laptop, it's upscaled ~2x, and it reads as blurry and muddy however well it's graded. Show footage at its native size (a portrait panel), or use a sharp still for the hero. The same goes for backgrounds: `.table-wrap::before` in `styles.css` keeps the menu photo at its own aspect ratio and fades it out, instead of `cover`-stretching it down a long page.

## Grade stills and a loop with ffmpeg
`template/scripts/grade-stills.sh` holds a reproducible winter-dusk grade: darker exposure, cool highlights, warm midtones, a soft "lamps on" bloom and a vignette.
- Stills: put ungraded frames in `media/stills-src/*.jpg`; graded copies land in `site/assets/`.
- Video loop: `VIDEO=media/raw/clip.mov START=42 LEN=8 scripts/grade-stills.sh` makes `site/assets/loop.mp4` (muted H.264, crf 30, faststart) and `loop-poster.jpg`.

Keep raw phone exports in gitignored `media/raw/`.

## "Lights on": relight a real photo with an image model
Take the host's real frame and ask an image-editing model to change only the time of day:

> Same composition, same camera, same furniture. Change only the time: December blue hour, string lights and lamps on, warm light in the windows.

- Keep the reference image as input. Pass the prompt on stdin if the CLI's image flag takes multiple values.
- Edit three frames the page actually uses (hero, table, living room). Consistent dusk art direction reads as intentional.
- Always get the host's OK. These are their real spaces.
- Overuse reads as a "uniform fake golden hour". One edited world is enough.

## What didn't work
Overlays on top of footage (CSS snow, drawn string lights) looked pasted-on every time. Put the season in the grade, the palette and the copy instead, plus at most one small flourish.
