#!/bin/sh
# Winter-dusk grade for the house stills: darker exposure, cooled/compressed highlights (windows read as
# blue hour), tungsten-warm midtones, cool shadows, a soft warm "lamps on" bloom, vignette.
# Sources: media/stills-src/*.jpg (ungraded, from the walkthrough video) -> site/assets/*.jpg
set -eu
cd "$(dirname "$0")/.."
GRADE="curves=all='0/0.02 0.25/0.2 0.6/0.6 1/0.93',eq=contrast=1.16:saturation=1.0:gamma=0.95,colorbalance=rs=-0.02:bs=0.05:rm=0.08:gm=0.02:bm=-0.07:rh=0.02:bh=-0.02"
FALL="exp(-(pow(X/W-0.55,2)+pow(Y/H-0.45,2))/0.07)"
GLOW="format=gbrp,geq=r='255*$FALL':g='150*$FALL':b='60*$FALL'"
for f in media/stills-src/*.jpg; do
  [ -e "$f" ] || continue
  ffmpeg -v error -y -i "$f" -filter_complex \
    "[0]$GRADE,format=gbrp,split[a][b];[b]$GLOW[g];[a][g]blend=all_mode=screen:all_opacity=0.12,vignette=angle=PI/7,unsharp=5:5:0.4,format=yuvj420p" \
    -q:v 3 "site/assets/$(basename "$f")"
done
echo "graded: $(ls media/stills-src | tr '\n' ' ')"

# Optional: a short muted loop + poster from a phone video (media/raw is gitignored).
#   VIDEO=media/raw/clip.mov START=42 LEN=8 scripts/grade-stills.sh
# Keep the native width (720 for most phone exports). Never upscale it.
VG="curves=all='0/0 0.3/0.24 0.65/0.6 1/0.9',eq=contrast=1.12:saturation=0.98:gamma=0.94,colorbalance=rs=-0.04:bs=0.07:rm=0.1:gm=0.03:bm=-0.07:rh=0.04:gh=0.01:bh=-0.03,unsharp=5:5:0.5"
if [ -n "${VIDEO:-}" ]; then
  START="${START:-0}"; LEN="${LEN:-8}"
  ffmpeg -v error -y -ss "$START" -t "$LEN" -i "$VIDEO" -an -vf "scale=720:-2,fps=24,$VG" \
    -c:v libx264 -preset slow -crf 30 -pix_fmt yuv420p -movflags +faststart site/assets/loop.mp4
  ffmpeg -v error -y -ss "$((START + LEN / 2))" -i "$VIDEO" -frames:v 1 -vf "scale=720:-2,$VG" -q:v 4 site/assets/loop-poster.jpg
  echo "graded: loop.mp4 loop-poster.jpg"
fi
