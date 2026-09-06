# Herdr app

A phone and laptop view into the local agent fleet. It shows projects and tasks
from projtrack, watches what a running task's Claude session is saying, types
straight into that session, and chats with the orchestrator daemon.

One codebase, two targets: an installed Android APK through Tauri 2, and the same
bundle served as a static page for the laptop browser. `DESIGN.md` is the UI
spec this was built from; it is the reference for anything not described here.

## Stack

Svelte 5 and Vite, no component library: every component in section 8 of the spec
is built directly in `src/components`. Inter and JetBrains Mono are bundled as
woff2 rather than fetched, because the phone is on Tailscale and may be offline.
Dark theme only.

## Running it

```bash
npm install
npm run dev          # laptop, on http://localhost:1420
npm run build        # static bundle in dist/, openable from any web server
npm test             # parser and formatting tests
```

For the phone:

```bash
npm run android:apk  # release APK signed with the Android debug key
```

The APK lands in
`src-tauri/gen/android/app/build/outputs/apk/universal/release/`. Published
builds are attached to the GitHub releases of this repo, which is the easiest way
to get one onto a phone.

`npm run android:dev` runs against a dev server on the laptop instead.

## Configuration

Everything the app talks to is set in the Settings sheet, reachable from the gear
on either root screen:

| Field | What it is |
| --- | --- |
| Bridge URL | The orchestrator daemon's app API, `http://<tailscale-host>:17988` from the phone |
| projtrack URL | Normally the same host and port; projtrack is proxied through the bridge |
| Bearer token | `app_api_token` from `~/.config/herdr-orchestrator/config.json` |
| Live refresh | Poll speed: fast, normal or slow |

Settings persist in `localStorage` on the laptop and in Tauri's store plugin on
Android.

projtrack listens on loopback and sends no CORS headers, so neither target can
call it from a browser: the phone is not on the host, and the laptop page is a
different origin. Its calls go through the bridge's `/projtrack/*` routes, which
also means one host and one token to configure rather than two.

## Backend

The daemon side lives in `~/src/herdr-telegram-orchestrator`, which serves the
pane bridge and the chat endpoint. Its README documents the routes; the app is
built against the shapes in section 2 of `DESIGN.md`.

## Two things worth knowing before changing the build

`devUrl` belongs in `src-tauri/tauri.conf.dev.json`, not the base config. With it
in the base config Tauri treats every build as a dev build, embeds no frontend,
and the APK installs but launches to a blank screen while it waits for a dev
server that is not there.

The pane transcript parser in `src/lib/pane-parse.ts` reads Claude Code's
rendered output, which moves between releases. The Terminal toggle on task detail
shows the raw pane text and does not depend on the parser, so a parser broken by
a future release costs formatting rather than the screen.
