# Third-party components

Copied (not linked) from other repos by `node scripts/vendor.js`, pinned in `vendor.json`. `node scripts/vendor.js --check` verifies the copies are untouched. Same author as party-lights. The copies keep a fresh clone working with no extra installs; to use these tools outside party-lights, install each from its repo (each README has an Install section).

| Component | Source | Commit | License | Used for |
|---|---|---|---|---|
| `skills/design-loop`, `agents/polish.md` | https://github.com/zog-r/wildling-design-loop | `0016346` | MIT | The design phase: seeds directions, runs rounds judged by a blind critic. |
| `skills/cool-uncle-shades` | https://github.com/zog-r/cool-uncle | `a67e556` | MIT | Final UX critique before publish. |
| `skills/markup` | https://github.com/zog-r/markup | `2edfbd0` | MIT | Click-to-annotate approval in the Claude desktop browser. |

One declared patch: `skills/markup/SKILL.md` points at `skills/markup/overlay.js` instead of `~/.claude/skills/markup/overlay.js`.

design-loop optionally uses `~/.claude/skills/avoid-ai-writing` for its copy check; it runs without it.
