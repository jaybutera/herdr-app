# Herdr app: UI design

A phone and laptop view into Casper's local agent fleet. Four things it does:
show projects and their tasks from projtrack, watch what a running task's
Claude session is saying, type straight into that session, and chat with the
orchestrator daemon. This document is the whole UI spec: navigation, every
screen, visual style, motion, and a component inventory. An implementing
session should be able to build from it without asking questions. Where a
choice was open, the choice is made here and marked as a decision.

App name shown in the UI: **Herdr** (decision; matches the directory name and
the server it fronts). Working title only, trivially renamable.

## 1. Stack and targets

One UI codebase, two targets:

| Target | Packaging | Notes |
| --- | --- | --- |
| Android phone | Tauri 2 mobile, installed APK | System WebView (Chromium). Not a browser tab: no URL bar, own launcher icon, own splash. |
| Laptop | The same web bundle served as a static site | Opened in a normal browser tab on the laptop. Tauri desktop window is optional and not required. |

Decision: web-tech UI inside Tauri 2, not Jetpack Compose. Casper asked for one
codebase usable from the laptop as a website plus a real APK; Tauri 2 ships
Android from the same frontend. Framework choice is left to the implementer
(Svelte, Solid or React are all fine); the constraints below are what matter:

- Everything in this document is expressed in CSS and DOM terms. No Material
  component library. Build the components in section 8 directly.
- Fonts are bundled in the app (Inter and JetBrains Mono, see section 6). No
  fetch from Google Fonts; the phone is on Tailscale and may be offline.
- Motion uses CSS transitions, `@starting-style`, and the same-document View
  Transitions API where available. Android System WebView has supported
  same-document view transitions since Chrome 111; guard with
  `document.startViewTransition ? ... : ...` and fall back to the plain
  state change with no animation.
- Respect `prefers-reduced-motion: reduce`: all durations drop to 0 except
  opacity fades, which drop to 80 ms.
- The layout is phone-first (360 to 430 px wide) with one responsive breakpoint
  at 900 px for the laptop layout (section 3.3). Nothing else in between.
- Safe areas: pad with `env(safe-area-inset-*)` on the bottom bar and the
  composer. Tauri Android exposes them.
- Colour scheme: dark only (decision, section 6). No light theme. Set
  `<meta name="color-scheme" content="dark">` and paint the body background
  explicitly so the WebView never flashes white.

## 2. Data the UI consumes

The UI talks HTTP to the laptop over Tailscale. Three sources. projtrack exists
today; the other two are a thin bridge the backend session must add (the
orchestrator daemon already has a loopback HTTP listener on port 17987 for
hooks, so the natural home is a second listener there, or a sibling service).
This section fixes the shapes the UI is built against so the UI and the bridge
can be built independently.

All base URLs live in Settings (section 5.6). Every request carries
`Authorization: Bearer <token>` when a token is configured; the UI does not
care whether the server checks it.

### 2.1 projtrack (exists; README at ~/src/projtrack/README.md)

| UI need | Call | Fields used |
| --- | --- | --- |
| Projects list | `GET /summary?status=all` | `generated_at`, `running_tasks`, `queued_tasks`, `projects[].{id,name,status,running_tasks,open_tasks,task_counts}` |
| Project detail | `GET /projects/{id}` | project fields plus `tasks[].{id,title,status,session_ref,result_summary,updated_at}` |
| Task detail | `GET /tasks/{id}` | task fields plus `events[].{note,created_at}` |
| Change project status | `PATCH /projects/{id}` `{"status": ...}` | active, dormant, dead |
| Mark a task | `PATCH /tasks/{id}` `{"status": ...}` | used for Abandon only |
| Add a note | `POST /tasks/{id}/events` `{"note": ...}` | |

Project status set: `active`, `dormant`, `dead`. Task status set: `queued`,
`running`, `done`, `failed`, `abandoned`. `session_ref` is a herdr pane id such
as `w95:p1`, empty when no session was ever attached. Timestamps are UTC ISO
8601 with a `Z`.

### 2.2 Pane bridge (to be added; wraps the `herdr` CLI)

| Call | Returns | Backing command |
| --- | --- | --- |
| `GET /panes` | `{ panes: [ {pane_id, workspace_id, label, cwd, agent_status} ] }` | `herdr agent list` joined with `herdr workspace list` for `label` |
| `GET /panes/{pane_id}` | one pane object as above, or 404 when the pane is gone | `herdr pane get` |
| `GET /panes/{pane_id}/read?source=recent-unwrapped&lines=200` | `{ pane_id, agent_status, read_at, text }` where `text` is plain text, no ANSI | `herdr pane read --format text` |
| `POST /panes/{pane_id}/send` `{ text }` | 204 | `herdr agent send` then `herdr pane send-keys Enter` |
| `POST /panes/{pane_id}/keys` `{ keys: ["Escape"] }` | 204 | `herdr pane send-keys` |
| `POST /panes/{pane_id}/text` `{ text: "1" }` | 204 | `herdr pane send-text`, no Enter; used to answer numbered permission dialogs |

`agent_status` values seen from herdr today: `working`, `idle`, `blocked`,
`done`, `unknown`. The UI treats `blocked` as needing Casper's attention.

The UI polls `read` every 2 seconds while a task detail screen is visible and
the app is in the foreground, and stops when it is not. If the bridge later
offers Server-Sent Events at `GET /panes/{pane_id}/stream` with the same JSON
body per event, the UI uses that instead and drops the poll. Build the poll
first.

### 2.3 Orchestrator chat (to be added to the daemon)

Same conversation the Telegram bot holds. Messages the daemon would have sent
to Telegram also land here; messages typed here go through the same
`handleMessage` path as a Telegram text message.

| Call | Shape |
| --- | --- |
| `GET /chat/messages?after={id}&limit=100` | `{ messages: [Message] }`, ascending by id |
| `POST /chat/messages` `{ text }` | 202, the user Message as stored |
| `GET /chat/stream` (SSE, optional) | one `Message` JSON per event; UI falls back to polling `messages` every 3 s while the Chat tab is visible |
| `GET /chat/state` | `{ busy: bool, muted: bool, agents: [ {pane_id, label, agent_status, cwd} ] }`; `busy` is true while the orchestrator is mid-turn |

```
Message {
  id:      integer, monotonic
  role:    "user" | "orchestrator" | "event" | "system"
  kind:    "text" | "finished" | "stalled" | "ended" | "error" | "status"
  text:    string, plain text, newlines preserved
  pane_id: string | null      // set on event messages, e.g. "w95:p1"
  ts:      ISO 8601 Z
}
```

`role: event` carries the watcher notifications the daemon already emits (✅
finished, ⚠️ stalled, session ended). `role: system` carries daemon replies to
slash commands (`/status`, `/new`, `/mute`). The UI strips a leading emoji from
`text` and renders `kind` with its own icon instead, so a message never shows
two icons.

### 2.4 Joining panes to tasks

A running task's `session_ref` is a pane id. The projects screens read
projtrack only; the task detail screen additionally calls the pane bridge with
that id. A chat event with a `pane_id` links to the task whose `session_ref`
matches, found from the cached `/summary` response. No other joins.

## 3. Navigation

### 3.1 Phone

Two top-level tabs in a bottom bar: **Fleet** and **Chat**. Fleet is a stack:

```
Fleet tab                      Chat tab
  Projects (root)                Chat (root)
    └─ Project detail
         └─ Task detail
```

- The bottom bar is visible on the two roots and on Project detail. It hides on
  Task detail and whenever a composer has focus, so the keyboard and the
  composer sit flush.
- Back: Android hardware/gesture back pops the Fleet stack; on a root it
  switches to Fleet if on Chat, and exits the app if on Fleet root.
- Switching tabs preserves each tab's scroll position and stack.
- A gear icon top-right on both roots opens Settings as a full-screen sheet.
- Deep link from Chat: tapping a pane chip in an event message pushes Task
  detail onto the Fleet stack and switches to Fleet.

### 3.2 Attention badge

The Chat tab icon carries a small dot when there are unread orchestrator or
event messages. The Fleet tab icon carries a red dot when any pane in the
cached `/panes` list is `blocked`. Both dots clear on viewing.

### 3.3 Laptop layout, 900 px and wider

Same routes, different arrangement. The bottom bar becomes a 64 px left rail
with the same two icons plus the gear at the bottom. Fleet becomes a
master-detail:

```
┌──────┬───────────────────┬────────────────────────────────────┐
│ rail │ Projects (320px)  │ Project detail  /  Task detail     │
│      │                   │                                    │
│ Fleet│  ● zpay v2 site   │  (whatever is selected; Task       │
│ Chat │  ● token buildout │   detail replaces Project detail   │
│      │  ○ projtrack      │   in this column, with a back      │
│  ⚙   │  …                │   chevron to return)               │
└──────┴───────────────────┴────────────────────────────────────┘
```

Chat on the laptop is a full column in place of the Projects+detail area, max
width 760 px, centred. At 1280 px and wider, Chat may instead be shown as a
persistent right-hand panel (360 px) next to Fleet, toggled from the rail;
build the simple full-column form first, the panel is a follow-up.

The selected project row in the master column stays highlighted. Nothing else
changes between targets: same components, same tokens, same motion.

## 4. Status vocabulary

Every status in the system maps to one colour token, one glyph, and one label.
These are the only status colours in the app; nothing else uses them.

| Domain | Value | Token | Glyph | Label shown |
| --- | --- | --- | --- | --- |
| project | active | `--c-live` | filled dot | Active |
| project | dormant | `--c-muted` | hollow dot | Dormant |
| project | dead | `--c-dead` | dot with strike | Dead |
| task | running | `--c-live` | pulsing dot | Running |
| task | queued | `--c-wait` | hollow dot | Queued |
| task | done | `--c-done` | check | Done |
| task | failed | `--c-alert` | cross | Failed |
| task | abandoned | `--c-dead` | dash | Abandoned |
| pane | working | `--c-live` | pulsing dot | Working |
| pane | idle | `--c-muted` | filled dot | Idle |
| pane | blocked | `--c-alert` | exclamation in ring | Needs you |
| pane | done | `--c-done` | check | Finished |
| pane | unknown | `--c-dead` | question mark | No agent |
| pane | (404) | `--c-dead` | slashed circle | Pane gone |

The pulsing dot is a 8 px circle with a second ring scaling from 1× to 2.2× and
fading out over 1.6 s, looping. Only `running` tasks and `working` panes pulse.

## 5. Screens

Each screen lists: layout, content rules, states, gestures. Widths in the
diagrams are phone widths. Spacing uses the 4 px grid from section 6.

### 5.1 Projects (Fleet root)

```
┌────────────────────────────────────┐
│ Herdr                          ⚙   │  ← title, 28px Inter semibold
│ 3 running · 7 queued · 9 projects  │  ← summary line, --t-secondary
│                                    │
│ [Active] [Dormant] [Dead] [All]    │  ← segmented filter, Active default
│                                    │
│ ┌────────────────────────────────┐ │
│ │ ● zpay v2 site                 │ │  ← ProjectCard
│ │   1 running  ·  2 done  · 1 ab │ │
│ │   ▸ Landing hero rewrite   ●   │ │  ← up to 2 running task titles
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │ ● token buildout               │ │
│ │   1 running  ·  2 queued       │ │
│ │   ▸ Deploy staging token   ●   │ │
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │ ● projtrack                    │ │
│ │   4 done                       │ │
│ └────────────────────────────────┘ │
│ …                                  │
├────────────────────────────────────┤
│        ⬡ Fleet          ◌ Chat     │  ← bottom bar
└────────────────────────────────────┘
```

Content rules:

- Source is `GET /summary?status=all`, fetched on screen show, on pull-to-
  refresh, and every 15 s while visible. The filter is applied client-side so
  switching it never spins.
- Summary line uses `running_tasks` and `queued_tasks` from the response
  computed over all projects regardless of filter, plus the count of projects
  in the current filter. When `running_tasks` is 0 the line reads
  "Nothing running · N queued · M projects".
- Sort within the filter: projects with a running task first, then by
  `updated_at` descending. Dead projects always last in the All view.
- ProjectCard shows the name, a counts line, and up to two running task titles
  each with the pulsing dot. The counts line lists only non-zero counts in the
  order running, queued, done, failed, abandoned, joined with " · ". Zero-count
  projects show "No tasks yet".
- Dead projects render at 55% opacity with the name struck through. Dormant
  projects render at 80% opacity, no strike.
- Card tap pushes Project detail. Card long-press opens a bottom sheet with
  "Mark active / dormant / dead" (current one disabled) which fires the PATCH
  and updates the card in place.

States:

- Loading (first load only): three skeleton cards with a slow shimmer; the
  summary line shows "Loading fleet".
- Empty filter: centred text "No dormant projects" (etc.) in `--t-secondary`.
- Error: an inline ErrorBanner under the filter reading "Can't reach
  projtrack" with the host from Settings and a Retry button. Cached cards stay
  visible below it, dimmed to 60%.
- Refreshing: the summary line's dot separators animate (see section 7);
  no spinner over content.

### 5.2 Project detail

```
┌────────────────────────────────────┐
│ ‹                              ⋯   │  ← back, overflow (status change)
│ ● zpay v2 site                     │  ← 24px semibold, status dot before
│ Active · updated 12 min ago        │
│ Next revision of the marketing…    │  ← description, 2 lines, expandable
│                                    │
│ RUNNING                            │  ← section label, 11px caps, tracking
│ ┌────────────────────────────────┐ │
│ │ ● Landing hero rewrite       › │ │  ← TaskRow, pulsing
│ │   w8K:p1 · started 43 min ago  │ │
│ └────────────────────────────────┘ │
│ QUEUED                             │
│ ┌────────────────────────────────┐ │
│ │ ○ Stale confirmations field  › │ │
│ └────────────────────────────────┘ │
│ FINISHED                           │
│ ┌────────────────────────────────┐ │
│ │ ✓ Overnight e2e offramp run  › │ │
│ │   Settled $1.50 to jay-butera… │ │  ← result_summary, 2 lines
│ │ ✕ Old checkout flow          › │ │
│ │   Abandoned; superseded by…    │ │
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│        ⬡ Fleet          ◌ Chat     │
└────────────────────────────────────┘
```

Content rules:

- Source `GET /projects/{id}`, refreshed every 10 s while visible.
- Three groups in fixed order: Running, Queued, Finished (done, failed,
  abandoned together, newest `updated_at` first). A group with no tasks is
  omitted entirely, not shown empty.
- TaskRow second line: for running, the pane id in mono plus "started N ago"
  from `updated_at`; for finished, the first two lines of `result_summary`;
  for queued, nothing.
- Failed rows use the alert colour for the glyph only, not the whole row.
- Tapping a running task pushes Task detail (live). Tapping any other task
  pushes Task detail (history); the same screen, different sections shown.
- Overflow menu: Mark active / dormant / dead. The description block expands
  on tap when it was truncated.

States: skeleton header plus two skeleton rows on first load; ErrorBanner with
cached content dimmed on failure; a 404 shows a full-screen empty state "This
project was deleted" with a Back button.

### 5.3 Task detail

One screen with two modes decided by task status. Running tasks with a
`session_ref` show the live view; everything else shows history.

#### 5.3a Live mode

```
┌────────────────────────────────────┐
│ ‹  Landing hero rewrite            │  ← 17px semibold, single line, ellipsis
│    ● Working · w8K:p1 · zpay landing│  ← LiveStatusLine (pane status, id, label)
│                                    │
│  Messages  |  Terminal             │  ← ViewToggle, Messages default
│ ┌────────────────────────────────┐ │
│ │                                │ │
│ │  ● I'll read the projtrack     │ │  ← MessageBlock, assistant prose
│ │    API docs first, then write  │ │
│ │    DESIGN.md.                  │ │
│ │                                │ │
│ │  ▸ Bash  Sample pane reads…    │ │  ← ToolLine, collapsed, mono
│ │  ▸ Bash  Read orchestrator…    │ │
│ │                                │ │
│ │  ● Got Casper's update. I'm    │ │
│ │    now writing DESIGN.md…      │ │
│ │                                │ │
│ │  ✢ Skedaddling… 24s            │ │  ← SpinnerLine when present
│ │                                │ │
│ └────────────────────────────────┘ │
│                          ⌄ latest  │  ← JumpToLatest pill, only when scrolled up
│ ┌────────────────────────────────┐ │
│ │ Message this session…      ➤   │ │  ← Composer
│ └────────────────────────────────┘ │
│ [Esc]  [1] [2] [3]  [Enter]        │  ← QuickKeys row
└────────────────────────────────────┘
```

Content rules:

- Header title is the task title. LiveStatusLine shows the pane's
  `agent_status` label and glyph from section 4, the pane id in mono, and the
  workspace label when the bridge returns one.
- Poll `GET /panes/{id}/read?source=recent-unwrapped&lines=200` every 2 s.
  Diff against the last text; re-render only when it changed. Do not animate
  unchanged blocks.
- **Messages view** parses the pane text into blocks using the same rules the
  orchestrator uses in `index.mjs` (`extractLastAgentMessage` and its
  `PANE_CHROME` list), generalised to keep every block rather than only the
  last:
  - A line starting with `●` or `⏺` starts a block. If the text after the
    bullet matches `^[A-Za-z][\w-]*\(` it is a tool call: render as a
    ToolLine (collapsed, one line, mono, chevron; tapping expands to show the
    following `⎿` result lines).
  - Otherwise it is assistant prose: render as a MessageBlock, continuing until
    the next bullet or a footer line (`❯`, `⏵`, a rule of `─`, or a spinner
    glyph `✢ ✻ ✽ ✶ ✳`).
  - A line starting with `❯` followed by text is Casper's prompt: render as a
    UserBlock, right-aligned, accent-tinted.
  - A spinner line (`✢ Skedaddling… (24s · ↓ 1.4k tokens)`) renders as
    SpinnerLine at the bottom with the word and elapsed time, and its glyph
    rotates through the five spinner characters at 8 fps.
  - Box-drawing lines (`╭ │ ╰ ├`) are a dialog. Collect the whole box and
    render it as a DialogCard: the box text in mono inside a card with the
    alert border, since these are permission or trust prompts.
  - Everything matched by `PANE_CHROME` is dropped.
- **Terminal view** shows the raw pane text in mono, 12 px, no wrapping
  changes, horizontal scroll allowed inside the pane. This is the fallback when
  the parser gets confused by a Claude Code release; it must always work.
- The list autoscrolls to the bottom on each change while the user is at the
  bottom. When the user scrolls up more than 80 px, autoscroll stops and the
  JumpToLatest pill appears; tapping it or scrolling back to the bottom
  re-enables it.
- **Composer**: single-line text field growing to 5 lines. Send fires
  `POST /panes/{id}/send`, clears the field, and shows the text immediately as
  a pending UserBlock with 60% opacity until the next pane read contains it
  (or 5 s pass, after which it is shown at full opacity regardless).
- **QuickKeys**: Esc sends `keys:["Escape"]`. 1, 2, 3 send `text:"1"` etc.
  with no Enter (Claude Code dialogs select on the digit). Enter sends
  `keys:["Enter"]`. The row is always present; when the pane is `blocked` the
  digit keys take the alert colour so they read as the way out.
- When `agent_status` is `blocked` the LiveStatusLine background tints to the
  alert colour at 12% and the label reads "Needs you".
- When the pane read returns 404, the header line reads "Pane gone", the
  composer and QuickKeys disable, and the last rendered transcript stays.

States: first load shows the header and a single centred "Reading pane…" line
with the spinner glyph cycling; error shows ErrorBanner above the composer
("Can't reach the pane bridge", Retry) and keeps the last transcript.

#### 5.3b History mode (queued, done, failed, abandoned)

```
┌────────────────────────────────────┐
│ ‹  Overnight e2e offramp run       │
│    ✓ Done · 3 h ago                │
│                                    │
│ RESULT                             │
│ ┌────────────────────────────────┐ │
│ │ Overnight e2e settled $1.50 to │ │  ← full result_summary, selectable
│ │ jay-butera on 2026-09-06.      │ │
│ │ Evidence: docs/e2e-overnight…  │ │
│ └────────────────────────────────┘ │
│ HISTORY                            │
│  15:25  spawning session in ~/src… │  ← EventRow, time in mono
│  15:26  created workspace w95      │
│  15:47  prompt delivered and turn… │
│                                    │
│ ┌────────────────────────────────┐ │
│ │ Add a note…                ➤   │ │  ← NoteComposer → POST events
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```

- Result section is omitted when `result_summary` is empty. Queued tasks show
  only History and the note composer, plus an Abandon action in the overflow.
- If a finished task still has a `session_ref` and `GET /panes/{id}` returns
  200, show a "Open session" text button under the status line that switches
  the screen to live mode; the session is still alive even though the ledger
  says done.
- Events are ascending by time. Times are local, HH:MM, with a date divider
  when the day changes.

### 5.4 Chat

```
┌────────────────────────────────────┐
│ Orchestrator                   ⚙   │
│ ● idle · 3 working · 1 needs you   │  ← ChatStatusLine from /chat/state
│                                    │
│ ┌────────────────────────────────┐ │
│ │       what's the landing       │ │  ← user bubble, right
│ │       rewrite session doing?   │ │
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │ zpay landing (w8K:p1) is       │ │  ← orchestrator bubble, left, no avatar
│ │ rewriting the hero copy; it    │ │
│ │ just ran the build, no errors. │ │
│ └────────────────────────────────┘ │
│ ─────────── 14:02 ───────────      │  ← time divider (gap > 10 min)
│ ┌────────────────────────────────┐ │
│ │ ✓ zpay landing finished        │ │  ← EventCard, kind=finished
│ │   Hero copy rewritten and      │ │
│ │   deployed to staging.         │ │
│ │   [w8K:p1 · Landing hero →]    │ │  ← PaneChip, links to the task
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │ ! token deploy never started   │ │  ← EventCard, kind=stalled, alert
│ │   [w9A:p1 →]                   │ │
│ └────────────────────────────────┘ │
│    ● ● ●                           │  ← TypingDots while busy
│ ┌────────────────────────────────┐ │
│ │ Message the orchestrator…  ➤   │ │
│ └────────────────────────────────┘ │
│ [/status] [/new] [mute]            │  ← SlashChips
├────────────────────────────────────┤
│        ⬡ Fleet          ◌ Chat     │
└────────────────────────────────────┘
```

Content rules:

- Load the last 100 messages on first open; keep them in memory for the app
  session. Scroll up to the top loads 100 more (`after` is used forwards; for
  history the bridge accepts `before={id}` with the same shape; if the bridge
  does not implement `before`, the top simply shows "Older messages are in
  Telegram").
- Poll `GET /chat/messages?after={lastId}` every 3 s while visible, or use the
  SSE stream when present.
- Bubbles: user right-aligned in the accent tint, orchestrator left in the
  raised surface colour. Max width 85% of the column. No avatars, no names;
  there are only two parties.
- Orchestrator text is plain text by contract (its system prompt forbids
  markdown). Render with `white-space: pre-wrap`; autolink URLs and pane ids
  matching `/\bw[\w]+:p\d+\b/` as PaneChips.
- EventCards are full-width, not bubbles, with the kind glyph and colour from
  the mapping: finished → `--c-done`, stalled and error → `--c-alert`, ended →
  `--c-muted`, status → `--c-muted` in mono.
- TypingDots show while `state.busy` is true or within 20 s of sending a
  message, whichever is longer.
- Composer sends on the send button or Ctrl/Cmd+Enter on the laptop; plain
  Enter inserts a newline on the laptop and sends on the phone.
- SlashChips send the literal command text as a message. "mute" toggles
  between `/mute` and `/unmute` from `state.muted`.
- Sending while offline queues the message locally with a clock glyph and
  retries on reconnect; the user bubble stays at 60% opacity until accepted.

States: skeleton of three bubbles on first load; ErrorBanner above the composer
on failure with cached messages intact; empty state (no messages ever) shows a
short centred hint "Ask what the fleet is doing" and the SlashChips.

### 5.5 Settings sheet

Full-screen sheet sliding up from the bottom. Fields, in order:

1. projtrack URL. Default `http://<tailscale-host>:8787`; placeholder shows the
   default. Below it a "Test" text button that hits `/health` and shows a
   green check or the error text inline.
2. Bridge URL (pane bridge and chat). Same Test button against `/chat/state`.
3. Bearer token. Masked, with a reveal toggle.
4. Poll intervals: a single "Live refresh" segmented control, Fast (1 s pane /
   2 s chat), Normal (2 s / 3 s, default), Slow (5 s / 10 s).
5. About: app version, build hash, a link to this document's location.

Values persist in `localStorage` on the laptop and in Tauri's store plugin on
Android. A Done button top-right closes the sheet; the Test buttons never block
closing.

### 5.6 Global overlays

- **OfflineStrip**: a 28 px strip under the header reading "Offline · retrying"
  in the muted colour when two consecutive polls to any source fail. Slides
  in and out. Disappears on the first success.
- **Toast**: bottom-anchored above the bottom bar, 3 s, for outcomes of
  actions: "Sent", "Marked dormant", "Note added", and errors in the alert
  colour. One at a time; a new toast replaces the current one.

## 6. Visual style

Dark only. The aesthetic is a dim control room: near-black ground, cards that
are barely lighter than the ground and separated by a hairline rather than a
shadow, one cool accent for interaction, and status colours doing all the
signalling. Nothing glows except things that are alive.

### 6.1 Palette

Define as CSS custom properties on `:root`.

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#0B0E13` | page background |
| `--surface` | `#12161E` | cards, bubbles, composer |
| `--surface-2` | `#1A2029` | pressed state, expanded tool lines, dialog cards |
| `--hairline` | `rgba(255,255,255,0.07)` | card borders, dividers |
| `--t-primary` | `#E8ECF1` | body and titles |
| `--t-secondary` | `#8C95A3` | metadata, counts, timestamps |
| `--t-tertiary` | `#586170` | placeholders, disabled |
| `--accent` | `#7C8CFF` | send buttons, links, selected segment, user bubbles at 18% alpha |
| `--accent-press` | `#6473F0` | pressed accent |
| `--c-live` | `#3DDC97` | running, working, active |
| `--c-wait` | `#F2C14E` | queued |
| `--c-done` | `#7FA3FF` | done, finished |
| `--c-alert` | `#FF6B6B` | blocked, failed, stalled, errors |
| `--c-muted` | `#8C95A3` | idle, dormant, ended |
| `--c-dead` | `#4A525E` | dead, abandoned, unknown, pane gone |

Rules: text on `--surface` uses `--t-primary` or `--t-secondary`, never a
status colour, except single-word status labels next to their glyph. Status
colours at 12% alpha are allowed as a tint behind a status line or chip.
Contrast (WCAG 2 relative luminance, computed on 2026-09-06 for these
values): `--t-secondary` on `--bg` is 6.4:1 and `--accent` on `--bg` is 6.5:1,
both above the 4.5:1 AA body-text bar. `--t-tertiary` on `--bg` is 3.1:1 and
`--c-dead` on `--bg` is 2.4:1, so those two are only used for placeholders,
disabled text and glyphs, never for text that carries information. A dead or
abandoned label is set in `--t-secondary` next to a `--c-dead` glyph.

### 6.2 Type

Two families, both bundled as woff2:

- **Inter** (variable) for everything that is not terminal output. Enable
  `font-feature-settings: "cv11", "ss01", "tnum"` so digits are tabular and
  counts line up.
- **JetBrains Mono** for pane ids, terminal view, tool lines, event times,
  slash commands.

| Style | Size / line | Weight | Where |
| --- | --- | --- | --- |
| display | 28 / 34 | 600 | Fleet and Chat root titles |
| title | 24 / 30 | 600 | project name on detail |
| heading | 17 / 22 | 600 | task title in detail header, card names |
| body | 15 / 22 | 400 | messages, descriptions, result text |
| meta | 13 / 18 | 400 | counts, timestamps, status lines |
| label | 11 / 14 | 600, 0.08 em tracking, uppercase | section labels (RUNNING, QUEUED) |
| mono | 13 / 18 | 400 | pane ids, tool lines, event times |
| terminal | 12 / 16 | 400 | Terminal view |

On the laptop layout, body and meta stay the same; display drops to 24 px.
Letter-spacing is 0 everywhere except label. No italics anywhere.

### 6.3 Spacing, shape, elevation

- 4 px grid. Screen horizontal padding 16 px on the phone, 24 px on the laptop.
- Card radius 14 px. Bubble radius 18 px with the corner nearest the sender
  at 6 px. Chips and QuickKeys 999 px. Composer 22 px. Buttons 12 px.
- Cards: `--surface` fill, 1 px `--hairline` border, no shadow. Elevation is
  expressed by lightness, not shadow: sheets and dialogs use `--surface-2`
  with a 1 px border and a backdrop of `rgba(0,0,0,0.55)` blurred 12 px.
- Touch targets 44 px minimum. Rows are 56 px minimum, two-line rows 68 px.
- Bottom bar 56 px plus the bottom safe-area inset, `--bg` at 92% with a
  16 px backdrop blur and a top hairline. Active tab icon and label in
  `--t-primary`, inactive in `--t-tertiary`. Icons 24 px stroke icons
  (Lucide set; decision), labels 11 px.

### 6.4 Iconography

Lucide icons at 1.75 px stroke. Status glyphs from section 4 are drawn as
inline SVG circles and marks, not icon-font glyphs, so they can pulse and
tint. Emoji never appear in the UI chrome; the only emoji on screen are ones
inside message text from the orchestrator that the UI failed to strip.

## 7. Motion

Durations and easings as tokens:

| Token | Value |
| --- | --- |
| `--ease-out` | `cubic-bezier(0.2, 0.8, 0.2, 1)` |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` |
| `--ease-spring` | `linear(0, 0.4 25%, 0.85 50%, 1.03 70%, 0.99 85%, 1)` |
| `--d-fast` | 120 ms |
| `--d-base` | 220 ms |
| `--d-slow` | 320 ms |

Transitions, all interruptible:

- **Push (list → detail)**: incoming screen slides in from the right by 24 px
  while fading from 0 to 1 over `--d-base` `--ease-out`; the outgoing screen
  shifts left 8 px and fades to 0.6. Pop reverses. When
  `startViewTransition` exists, the tapped card's name and status dot get a
  `view-transition-name` matching the detail header's, so the name travels to
  its new position and size over `--d-slow`.
- **Tab switch**: crossfade `--d-fast`, no movement.
- **Sheets** (Settings, long-press menu): slide up over `--d-slow`
  `--ease-spring`; backdrop fades over `--d-base`. Drag down to dismiss with
  the sheet tracking the finger; release past 30% dismisses.
- **Card press**: scale to 0.98 and fill `--surface-2` over `--d-fast`,
  release springs back over `--d-base` `--ease-spring`.
- **New transcript blocks** (Messages view): each new block enters by
  translating up 6 px and fading in over `--d-base`. Blocks that only changed
  text do not animate. The autoscroll to the bottom is smooth over `--d-base`.
- **New chat message**: same entrance as a transcript block. TypingDots are
  three 6 px dots bouncing 3 px in sequence over 900 ms.
- **Pulse** (running/working dot): described in section 4. It is the one
  ambient animation in the app; it stops when the tab is hidden.
- **Refresh**: the three " · " separators in the summary line step through
  `--accent` in sequence over 600 ms while a fetch is in flight, instead of a
  spinner. Pull-to-refresh on the phone shows a 20 px arc that fills with the
  pull distance and spins once on release.
- **Segmented filter**: the selected pill background slides between segments
  over `--d-base` `--ease-out`; the list under it crossfades.
- **Status change** (a task flips running → done between polls): the glyph
  crossfades and the row moves to its new group with a FLIP animation over
  `--d-slow`; if the row leaves the visible area it just fades.
- **Skeletons**: a shimmer band moving left to right every 1.4 s, `--surface`
  to `--surface-2` and back.

With reduced motion: everything above becomes an 80 ms opacity fade or nothing;
pulse becomes a static dot; skeletons stop shimmering.

## 8. Component inventory

Each component: props, visual, and where it appears. Build these and nothing
else; screens compose them.

| Component | Props | Notes |
| --- | --- | --- |
| `AppShell` | active tab, children | Bottom bar on phone, left rail at ≥ 900 px. Owns safe areas. |
| `Header` | title, back?, actions[] | Large form (display) on roots, compact form (heading + back) on pushed screens. |
| `SummaryLine` | running, queued, projects, refreshing | The " · " separated line under the Fleet title with the refresh animation. |
| `SegmentedFilter` | options[], value | Sliding pill. Used for project status filter, Messages/Terminal toggle, poll speed. |
| `StatusDot` | domain, value, size, pulse | Section 4 glyph and colour. |
| `ProjectCard` | project (summary shape) | Name, counts line, up to two running task lines. Long-press → `ActionSheet`. |
| `SectionLabel` | text | 11 px caps, `--t-secondary`, 24 px top margin, 8 px bottom. |
| `TaskRow` | task | Glyph, title, second line by status, chevron. |
| `LiveStatusLine` | agent_status, pane_id, label | Tinted when blocked. |
| `Transcript` | blocks[], autoscroll | Scroll container with the JumpToLatest pill. |
| `MessageBlock` | text | Assistant prose, body type, 12 px vertical padding, bullet glyph in `--t-tertiary`. |
| `UserBlock` | text, pending | Right-aligned, accent tint at 18%, 60% opacity while pending. |
| `ToolLine` | head, result[] | Mono one-liner with chevron; expands to show result lines in `--surface-2`. |
| `DialogCard` | lines[] | Mono box text inside an alert-bordered card. |
| `SpinnerLine` | word, elapsed | Cycling glyph plus text, `--t-secondary`. |
| `TerminalView` | text | Raw mono, horizontal scroll, `--surface` background. |
| `Composer` | placeholder, onSend, disabled, multiline | Grows to 5 lines; send button uses `--accent`, disabled uses `--t-tertiary`. |
| `QuickKeys` | keys[], alertDigits | Chip row under the pane composer. |
| `ChatBubble` | role, text, pending | user / orchestrator bubbles. |
| `EventCard` | kind, text, pane_id?, task? | Full-width event with glyph and optional `PaneChip`. |
| `PaneChip` | pane_id, label?, taskId? | Mono chip; tapping navigates to the task when known, else shows a toast "No task for this pane". |
| `TimeDivider` | ts | Centred meta text with hairlines either side. |
| `TypingDots` | | Three bouncing dots. |
| `SlashChips` | muted | `/status`, `/new`, mute toggle. |
| `EventRow` | ts, note | History row in task detail. |
| `ResultCard` | text | Selectable body text in a card. |
| `ActionSheet` | title, actions[] | Bottom sheet, one row per action, destructive rows in `--c-alert`. |
| `SettingsSheet` | | Section 5.5. |
| `TextField` | label, value, masked?, testAction? | Filled field on `--surface`, 1 px hairline, accent border on focus. |
| `ErrorBanner` | text, onRetry | `--c-alert` at 12% tint, alert-coloured text, Retry text button. |
| `OfflineStrip` | | Section 5.6. |
| `Toast` | text, tone | Section 5.6. |
| `Skeleton` | shape | Card, row, bubble variants. |
| `EmptyState` | text, action? | Centred meta text, optional text button. |

## 9. Interaction details that must not be skipped

- All polling stops when the page is hidden (`visibilitychange`) and resumes
  with an immediate fetch on return. On Android, Tauri fires this on
  background; on the laptop, switching tabs does.
- Sending into a pane must never double-submit: the send button disables until
  the request returns, and Enter on the phone keyboard is the send action only
  when the field is non-empty.
- A pane read that fails three times in a row while the status was `working`
  keeps the last transcript on screen and shows the ErrorBanner; it does not
  clear the view.
- Text in MessageBlock, ResultCard, TerminalView and ChatBubble is selectable
  and long-press copies on Android.
- The Fleet root remembers its filter choice across launches.
- Time strings: under 60 s "just now", under 60 min "N min ago", under 24 h
  "N h ago", otherwise the local date "6 Sep". Never show raw ISO strings
  outside Terminal view.
- Numbers are tabular everywhere; counts never shift the layout as they change.

## 10. Decisions taken here, for the record

- Tauri 2 with a web-tech UI, one codebase for the APK and the laptop web page.
- Dark theme only.
- Two tabs, Fleet and Chat; Settings as a sheet, not a tab.
- Pane transcript polled at 2 s, chat at 3 s, projects at 15 s, with SSE as an
  optional upgrade for the two live sources.
- The bridge API shapes in section 2.2 and 2.3 are the contract; the backend
  session implements them, the UI session mocks them until then.
- Lucide icons, Inter and JetBrains Mono, bundled.
- App display name "Herdr".
