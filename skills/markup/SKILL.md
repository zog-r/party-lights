---
name: markup
description: Use when the user types "/markup <url>", wants to mark up a deployed site for copy/design/UX edits in the side-panel browser, or says "apply my markups". Injects a click-to-annotate overlay into the built-in browser, then reads the annotations back and edits the site's source.
---

# Markup

Two phases. The user annotates; you apply.

## 1. Open and inject

1. Need the site URL and the local repo path for the site. Ask once if either is missing.
2. `mcp__Claude_Browser__navigate` to the URL (opens the side panel).
3. Read `overlay.js` next to this SKILL.md (here: `skills/markup/overlay.js`) and run its full contents with `mcp__Claude_Browser__javascript_tool` (`javascript_exec`). A panel appears bottom-right of the page.
4. Tell the user: click an element, pick copy/design/ux, type the change, Add. Say "apply" when done.

The overlay is lost on full page navigation; marks persist in localStorage, so re-running the script restores them. Re-inject after the user navigates to another page.

## 2. Apply

1. Run `JSON.stringify(window.__markups())` via `javascript_tool` (inject again first if it is undefined).
2. **Log first.** Before editing, append a dated entry to `<repo>/markup-log.md` (create it if missing): `## YYYY-MM-DD HH:MM — <url>` then one line per mark: `N. [cat] <path> <selector> — "<comment>"`. After editing, fill in each line's outcome: `→ done: <file>` or `→ not located`. Append only; never rewrite earlier entries.
3. Each mark has `selector`, `text`, `classes`, `html`, `style`, `path`, `cat`, `comment`. Locate the source: grep the repo for the `text`/`classes`/route `path`, then make the edit. Smallest diff.
4. `cat` guides the edit: **copy** = text only; **design** = CSS/Tailwind classes; **ux** = structure/behavior, flag it if the change is larger than the comment implies.
5. Marks you cannot locate with confidence: list them, do not guess.
6. Summarize edits per mark number. Do not commit or deploy unless asked. After deploy, the user can reload and re-mark; clear the old marks with the overlay's "Clear all".
