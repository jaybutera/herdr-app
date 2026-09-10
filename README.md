# Orcha app

A phone and laptop view into the local agent fleet. It shows projects and tasks
from projtrack, watches what a running task's Claude session is saying, types
straight into that session, and chats with the orchestrator daemon.

One codebase, three targets: an installed Android APK through Tauri 2, the same
bundle installed on an iPhone as a web app, and that bundle open in the laptop
browser. `DESIGN.md` is the UI spec this was built from; it is the reference for
anything not described here.

## Being told about a new message

The Chat tab carries a dot, a toast appears if the app is on screen, and the
phone or the laptop posts a system notification when the orchestrator answers
or a session finishes while the chat is not in front of you. Turn the
notifications on under Settings > New message notifications; the toggle is what
asks the platform for permission, since neither Chrome nor Android 13 will
prompt without a tap. The dot and the toast need no permission and are always
on.

It is polling, not a push service: the app asks the daemon for anything after
the last message it showed you, on the projects cadence, and only while the
chat is not on screen. On the laptop that keeps working in a background tab. On
either phone the app is suspended when it is backgrounded, so the notification
arrives when the app is next foregrounded rather than while it is asleep — a
real background push would need a daemon-side service and a notification
channel, which this deliberately does not have.

On the iPhone the toggle needs the home-screen install first: iOS gives a page
open in a Safari tab no notifications at all, and `Notification` does not even
exist there for the toggle to ask with. Installed, it exists and the permission
prompt appears on the tap.

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

## For the iPhone

There is no iOS package: the phone installs this same bundle as a web app —
a home-screen icon that opens without Safari's chrome, keeps working when the
laptop is asleep, and can post a notification. A browser will only install one
from an HTTPS origin, which is why the page is hosted rather than served off
the laptop:

**https://orcha-app-production-457c.up.railway.app** — the `orcha-app` service
in the `rural-lettuce` Railway project. `npm run deploy` builds and ships it;
there is no APK to sideload and no reinstall on the phone, a rebuild arrives on
next launch.

On the phone: open that URL in Safari, Share > Add to Home Screen, and open it
from the icon. In Settings put the orchestrator's address in Bridge URL and its
`app_api_token` in Bearer token. Leave projtrack URL blank — it means "wherever
the bridge is", which is where projtrack is reached from anyway, and an address
entered there is only ever a way to get it wrong.

### Which address the app is pointed at

The page is hosted; the orchestrator is not, and cannot be — the token in front
of it is the only thing between the tailnet and typing into any Claude session.
That leaves two arrangements, and the difference is not a preference:

1. **The phone reaches the laptop itself**, at `https://<machine>.<tailnet>.ts.net`
   (`tailscale serve --bg http://127.0.0.1:17988` on the laptop publishes it
   with a real certificate). Nothing else to run. But a page on a public origin
   asking a browser to open a connection to a private address — Tailscale's
   `100.64/10` is one — is what Chrome 152 calls Local Network Access, and it
   will not do it without a permission an installed web app is never asked for:
   the request hangs until it times out. Safari does not enforce this yet.
2. **The hosted page reaches the laptop**, over a tailnet the Railway container
   joins at start. `/bridge/*` is then proxied to the orchestrator, the page and
   the API share one origin, every browser is content, and the phone does not
   need Tailscale at all. It costs an ephemeral auth key, and it means the
   orchestrator is reachable through a public URL — behind the bearer token,
   and behind a check in `server.mjs` that refuses anything unauthenticated
   before it becomes traffic on the laptop, but reachable.

The second is built and dormant. Setting `TS_AUTHKEY` and
`BRIDGE_TARGET=http://<machine>.<tailnet>.ts.net:17988` on the Railway service
turns it on, and Bridge URL on the phone becomes
`https://orcha-app-production-457c.up.railway.app/bridge`.

### Three things worth knowing

- **Open it from the icon, not the tab.** The Safari tab and the installed app
  are separate: separate storage, so Settings entered in one is not in the
  other, and notifications only in the installed one.
- **The laptop can serve the page too.** `app_static_dir` in the orchestrator's
  config points at this `dist/` and it serves the app at `/` — one origin for
  page and API, which is the arrangement browsers like best. It is only ever as
  available as the laptop, which is why it is not where the phone is pointed.
- **A rebuild reaches the phone on next launch.** `index.html` and `sw.js` are
  served `no-cache` and everything under `/assets/` is content-hashed — but the
  worker answers the launch from cache when the host does not answer in 2.5 s,
  so a phone with no signal keeps opening the version it has.

## Configuration

Everything the app talks to is set in the Settings sheet, reachable from the gear
on either root screen:

| Field | What it is |
| --- | --- |
| Bridge URL | The orchestrator daemon's app API. Defaults to the origin the page was served from, which is right whenever that origin also answers the API |
| projtrack URL | Blank, meaning the bridge. projtrack is proxied through it, so this is the same address in every deployment there has been; a loopback value here is ignored when the bridge is elsewhere, because from a phone it names the phone |
| Bearer token | `app_api_token` from `~/.config/herdr-orchestrator/config.json` |
| Live refresh | Poll speed: fast, normal or slow |

Settings persist in `localStorage` on the laptop and on the iPhone, and in
Tauri's store plugin on Android.

projtrack listens on loopback and sends no CORS headers, so neither target can
call it from a browser: the phone is not on the host, and the laptop page is a
different origin. Its calls go through the bridge's `/projtrack/*` routes, which
also means one host and one token to configure rather than two.

## Backend

The daemon side lives in `~/src/herdr-telegram-orchestrator`, which serves the
pane bridge and the chat endpoint. Its README documents the routes; the app is
built against the shapes in section 2 of `DESIGN.md`.

## The app id is still `dev.herdr.app`

The app was renamed from Herdr to Orcha in v0.1.3, but only the visible name
changed. Android identifies an installed app by its `applicationId`, and the
Tauri store that holds the bridge URL and the bearer token lives in a data
directory derived from it. Changing it to `dev.orcha.app` would make the phone
treat the next APK as a different app: the old one would stay installed and the
new one would start with an empty Settings sheet. There is no Play listing whose
id has to match the name, so the id stays and the upgrade keeps working.

## Three things worth knowing before changing the build

`devUrl` belongs in `src-tauri/tauri.conf.dev.json`, not the base config. With it
in the base config Tauri treats every build as a dev build, embeds no frontend,
and the APK installs but launches to a blank screen while it waits for a dev
server that is not there.

The pane transcript parser in `src/lib/pane-parse.ts` reads Claude Code's
rendered output, which moves between releases. The Terminal toggle on task detail
shows the raw pane text and does not depend on the parser, so a parser broken by
a future release costs formatting rather than the screen.

On Android every request goes through `tauri-plugin-http` rather than the
WebView's `fetch`, and `src-tauri/capabilities/default.json` carries the URL
scope that allows it; without that scope the plugin denies every request. This
is what v0.1.1 fixed: v0.1.0 called the WebView's `fetch` with
`AbortSignal.timeout`, which is Chrome 103 and later while `minSdk` here is 24,
so on an older System WebView it threw before the request was made and the app
reported a reachable server as unreachable. Keep new browser APIs out of the
request path, or feature-detect them; the phone's WebView is not the laptop's
browser and its version is not yours to choose.
