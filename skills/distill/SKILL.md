---
name: distill
description: Use after building or changing a real event app, when the user says "distill", "port this back", or "what did we learn". Reads the private build log and the event repo's git history, then proposes generic improvements to party-lights's template, recipes, and skills. Nothing personal may cross over.
---

# Distill: one real event → a better Party Lights

The rule: **build the instance, then extract the tool.** A real event repo is where things get tried. Party Lights only receives what's generic and proven.

## Inputs
- The event repo's git log since the last distill: `git -C <event repo> log --oneline <since>..`
- The private build log (kept outside the public tree, for example in a gitignored `_private/build-log.md`).

## Sort every change into one of three buckets
1. **Template:** code or CSS that any event would want (a bug fix, a new generic page section, a test). Port it into `template/`, keeping event-specific values in `event.json`. If the change needed a new config field, add it to `template/event.schema.json` and the example `event.json`.
2. **Recipe:** a lesson, gotcha, or technique. Add it to the matching file in `recipes/`, written for a stranger. Say what happened and what to do, with no names or places.
3. **Stays private:** copy, photos, guest data, IDs, anything that identifies the host, the place or the guests.

## Rules
- Before committing, run `npm test` at the Party Lights root. It checks the template, the validator, and that `new-event.js` produces a working app.
- Before any push, run the ship gate (`/agnostic --verify` on the committed tree, with the instance's identifying terms on the blocklist). A failed gate means something personal crossed over: remove it at the source.
- Prefer deleting over adding. If the template grew a special case for one event, make it a config field or leave it in the instance.
