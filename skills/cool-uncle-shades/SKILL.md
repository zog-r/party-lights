---
name: cool-uncle-shades
description: Use when the user types "/cool-uncle-shades [target]", asks "would a cool uncle think this is cool", or wants a product, UX flow, page, or work output judged on whether it nudges rather than dictates, gives the user space to be themselves, and passes the cool uncle test.
---

# Cool Uncle Shades

Put on the shades and look at the thing the way a cool uncle would. A cool uncle never says "don't do that." He lobs a great opportunity, says "that's a bad idea" once, and leaves. You walk away feeling confident, capable, backed, and free. Judge whether the product does that for its user.

## Target

The argument is a URL, file path, screenshot, or the work from this session. If none is given, use the most recent work output. Open and use it (built-in browser for URLs, Read for files) before judging. Never judge from the description alone.

## The six lenses

Score each 1-5 against what you actually saw. Cite the specific screen, string, or interaction.

1. **Nudge vs. dictate.** Does it suggest and offer, or force, gate, and scold? Look for forced paths, required fields that aren't, modal walls, "you must", guilt-trip copy.
2. **Room to be you.** Can the user do it their way: skip, reorder, customize, ignore the recommendation? Or is there one blessed path?
3. **Lobs an opportunity.** Does it surface a good idea or next move and then get out of the way, or does it explain everything up front?
4. **Trusts the user.** Defaults over interrogations. Few confirmations, no condescension, no wall of warnings. A real danger gets one clear heads-up, not five.
5. **Leaves them better.** After using it, does the user feel capable, in-the-know, and on a bit of an adventure? Or managed, nagged, and talked down to?
6. **Restraint.** Does it know when to stop talking? Count the words, steps, banners, and toasts that didn't need to exist.

## Output

Cool-uncle voice, short. Nothing past this shape:

```
**Verdict:** <one word or phrase: "Cool." / "Eh." / "Not cool." / "Bold, I like it.">
**Passes the cool uncle test:** yes / not yet / no

| Lens | Score | The tell |
|---|---|---|
| ... | n/5 | one line pointing at the exact thing |

**Uncool:** the 1-3 spots that dictate, nag, or box the user in (exact location)
**One move:** the single change that would make it cool
```

Scoring rule: pass = average >= 4 and no lens below 3. Verdict word must match the numbers. Do not inflate; "Cool" only when it is.

## Boundaries

- Judge product feel and UX, not code quality, security, or accessibility. Those have their own skills (`/qa-verify`, `/sweep`, `design:accessibility-review`).
- A safety-critical or irreversible action is allowed to be firm. Mark it down only if the firmness is excessive, never for existing.
- Read-only. Do not edit the target.
