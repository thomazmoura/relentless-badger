# <img src="design/logo-color-source.png" alt="RelentlessBadger logo" width="40" align="top"/> RelentlessBadger

A persistent-reminder to-do app: tasks are extremely fast to add, and the app **nags you with notifications until you mark them done**.

- **Backend** — .NET 10 Web API + PostgreSQL (`backend/`)
- **App** — native Android, Kotlin, Jetpack Compose + Material 3 (`android/`)
- **Web app** — Angular + Angular Material PWA, installable from the browser (`web/`)
- **Auth** — Google Sign-In only (OAuth2); you log in once per device
- **Reminders** — scheduled locally on the device (AlarmManager), no Firebase needed; they work offline and survive reboots
- **Quick-add** — fzf-style fuzzy autocomplete over your task history: type `totr` and *take out trash* is suggested

## How reminders work

Each task snapshots two user-configurable defaults at creation time (Settings screen):

1. **First reminder after** N minutes (default 60)
2. **Then nag every** M minutes (default 15) — repeats until the task is completed

The app is **offline-first**: the local Room database is the source of truth, and every feature — creating tasks, marking them done, snoozing, editing settings, title autocomplete — works with no connection. Notifications are driven by local exact alarms, so reminders fire and repeat offline and across reboots.

The backend's only job is keeping devices in sync. Every local change is flagged (`pendingCreate` / `pendingDone` / dirty settings) and pushed by a WorkManager job that runs the moment connectivity is available, plus a 6-hour periodic pull as a safety net. Task ids are minted on the device, so pushing a create twice (e.g. after a lost response) can't duplicate the task. Tapping **Done** on the notification (or in the list) stops the nagging immediately, wherever you are; the server hears about it whenever the network comes back.

## Quick start (one command)

```bash
./dev.sh
```

Starts PostgreSQL (docker compose), the API (`dotnet watch run` — backend code changes hot-reload without a restart), and an Android emulator, then builds, installs and launches the app on it. The script streams API logs; **Ctrl+C stops the API** but leaves the database and emulator running so the next `./dev.sh` is fast. Stop everything with:

```bash
./dev.sh down
```

Inside the emulator the API is reachable at `http://localhost:5000` (the script sets up `adb reverse`; `http://10.0.2.2:5000` also works). Requires at least one AVD (create one in Android Studio's Device Manager); it uses the first one listed, or set `AVD=<name> ./dev.sh` to pick. Logs and pidfiles live in `.dev/`.

The sections below describe the same steps individually — useful for a physical device or a first-time setup.

## Prerequisites

- .NET 10 SDK, Docker (for the API machine)
- JDK 17 + Android SDK (or just Android Studio) to build the app
- An Android device on the same network as the API machine

On Debian/Ubuntu, `./install-deps.sh` checks and installs all of the above (PostgreSQL stays in Docker — never installed locally) and symlinks `adb`/`emulator` into `~/.local/bin` so they're on your PATH. It's idempotent and only asks for sudo when something is actually missing.

## 1. Run the backend

```bash
docker compose up -d                       # PostgreSQL 17 on :5432
cd backend/RelentlessBadger.Api
dotnet run                                 # http://0.0.0.0:5000, auto-applies migrations
```

The `Development` environment (the default with `dotnet run`) includes a dev JWT signing key and a **dev auth bypass**: `POST /auth/google` with `{"idToken": "dev-token"}` returns a valid session token without Google. Try it:

```bash
TOKEN=$(curl -s -X POST http://localhost:5000/auth/google \
  -H 'Content-Type: application/json' -d '{"idToken":"dev-token"}' | jq -r .token)
curl -s -X POST http://localhost:5000/tasks \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"take out trash"}'
```

For anything beyond local development, set a real `Jwt:Key` and remove `Auth:DevBypassToken` (see `appsettings.Development.json`).

Make sure the phone can reach port 5000 (e.g. `sudo ufw allow 5000` on Ubuntu). Find the machine's LAN IP with `ip -4 addr` — you'll bake `http://<that-ip>:5000` into the app build (see section 3).

## 2. Google OAuth setup (one-time)

The PoC only supports Google accounts. In [Google Cloud Console](https://console.cloud.google.com/):

1. Create a project → **APIs & Services → OAuth consent screen**. Choose *External*, stay in **Testing** mode, and add your Gmail address as a test user.
2. **Credentials → Create credentials → OAuth client ID**, twice:
   - **Android** client: package name `com.relentlessbadger.app`, SHA-1 from your debug keystore:
     ```bash
     keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android | grep SHA1
     ```
   - **Web application** client: no redirect URIs needed. **Its client ID is the one both sides use.**
3. Put the **Web** client ID in two places:
   - `backend/RelentlessBadger.Api/appsettings.json` → `Auth:GoogleClientId`
   - `android/gradle.properties` → `BADGER_GOOGLE_WEB_CLIENT_ID`

If `BADGER_GOOGLE_WEB_CLIENT_ID` is left empty, the app shows a **Dev sign-in** button instead of Google — handy for testing the whole flow before OAuth is configured (requires the server's dev bypass).

## 3. Install the app on your phone

Build the APK with the server URL baked in (the app then connects without asking; the URL stays reachable behind an **Advanced** toggle on the sign-in screen):

```bash
cd android
./gradlew assembleDebug -PBADGER_API_BASE_URL=http://<api-machine-ip>:5000
```

Leave the property out (or blank) and the sign-in screen shows the URL field instead. Instead of the `-P` flag you can also set `BADGER_API_BASE_URL` in `android/gradle.properties`, or export `ORG_GRADLE_PROJECT_BADGER_API_BASE_URL` (that's how CI/CD would inject the production URL).

The APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`. Get it onto the phone either way:

**Via USB (adb).** On the phone, enable Developer options (Settings → About phone → tap *Build number* 7×) and turn on *USB debugging*, plug it in, accept the authorization prompt, then:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

(`adb devices` should list the phone, not just an emulator. Wireless works too: Developer options → *Wireless debugging* → `adb pair`.)

**Without a cable (sideload).** Copy `app-debug.apk` to the phone however you like (Drive, messaging app, `python3 -m http.server` on the APK folder and download it in the phone's browser), tap the file, and allow *Install unknown apps* for whichever app opened it.

On first launch: sign in with Google (once — the session token lasts ~180 days), allow notifications, and optionally grant exact alarms if the banner appears. Traffic is plain HTTP, intended for a trusted LAN only.

> Debug builds are the intended path for this PoC — `assembleRelease` produces an unsigned APK phones refuse to install, and no release signing config exists yet.

## 4. Run the web app

The same app in a browser: Angular + Angular Material, installable as a PWA, with **localStorage** in the role Room plays on Android. It shares the backend, so a task added on the phone shows up on the desktop and back.

```bash
cd web
npm install
npm start                      # http://localhost:4200, API at http://localhost:5000
```

`src/environments/environment.development.ts` holds the dev API URL and the Google client ID; `environment.ts` is the production pair (both empty by default, which shows the server-URL field and the dev sign-in button — the same rules the Android sign-in screen follows).

Two things must be configured before the web app can talk to a server:

- **CORS.** The API only answers browsers from origins listed in `Cors:AllowedOrigins` (`http://localhost:4200` and `:4300` in `appsettings.Development.json`; `WEB_ORIGIN` in `.env` for production).
- **Google origins.** In the Cloud Console, add each origin (`http://localhost:4200`, the production URL) to the **Web** OAuth client's *Authorized JavaScript origins*. No redirect URI is needed — the app uses Google Identity Services, which returns the ID token in the page.

### Installing it

The service worker (and therefore installability and notifications) only runs in a production build:

```bash
npm run build
npx http-server dist/web/browser -p 4300 -c-1     # http://localhost:4300 is a secure context
```

Open it, sign in, allow notifications, then install from the browser's address bar (or *Add to Home Screen* on mobile). Reminders then fire like the Android app's — with one honest limitation.

### How reminders differ from Android

Android schedules exact alarms that survive reboots and fire with the app closed. A browser has no equivalent, so:

| | Android | Web |
|---|---|---|
| App open / tab in background | exact alarms | timers in the page, swept every few seconds |
| App closed, browser running | exact alarms | best effort |
| Browser closed | exact alarms | **nothing fires**; everything missed is nagged on the next visit |
| Notification actions | Wait / Other… / Done | Wait / Done (the web caps actions at 2); tapping the body opens the wait picker |
| Acting on a notification | applied silently | focuses the app, which applies it |

Multiple open tabs elect a single leader, so a reminder is never shown twice.

## Deploy to a Raspberry Pi

`deploy/publish.sh` puts the current working tree on a Pi: PostgreSQL, the API and the web PWA, served over HTTPS on port 443 by a small nginx gateway:

- `https://<pi>.ts.net/badger` — the web app
- `https://<pi>.ts.net/badger-api` — the API (the Android app's server URL)

The certificate comes from Tailscale, so the server is reachable (and trusted) from your tailnet devices only. Everything runs from your dev machine over ssh. The images are built locally for `arm64` (both Dockerfiles cross-compile, so no emulation is involved) and streamed to the Pi, which needs no toolchain and no registry.

```
tailnet ──443──▶ gateway (nginx, ~/gateway)
                 ├─ /badger/      → relentlessbadger-web  (static PWA)
                 └─ /badger-api/  → relentlessbadger-api  → relentlessbadger-db (volume relentlessbadger_pgdata)
```

### One-time setup

On the Pi (64-bit Raspberry Pi OS):

1. Install Docker with the compose plugin and add your user to the `docker` group.
2. Install Tailscale and join the tailnet. In the admin console, enable **MagicDNS** and **HTTPS certificates**, then allow your user to request certificates: `sudo tailscale set --operator=$USER`.
3. Create the server secrets: `mkdir -p ~/relentlessbadger` and write `~/relentlessbadger/.env` from [`.env.example`](.env.example) (`POSTGRES_PASSWORD`, `JWT_KEY`, `GOOGLE_CLIENT_ID`). This file never leaves the Pi.

On your dev machine:

1. Get key-based ssh to the Pi working (`ssh <pi>.ts.net` without a password prompt), and join the same tailnet.
2. Install Docker with `buildx`.
3. `cp deploy/deploy.env.example deploy/deploy.env` and set at least `PI_HOST` and `GOOGLE_WEB_CLIENT_ID`. Every setting can also be exported instead, and exports win over the file.
4. In the Google Cloud Console, add `https://<pi>.ts.net` to the Web client's *Authorized JavaScript origins*. The dev sign-in bypass doesn't exist in Production, so Google sign-in has to work.

### Publish

```bash
deploy/publish.sh
```

In order, it:

1. Checks the Pi (Docker, Tailscale, `.env`).
2. Builds both images and tags them with the git sha (plus `-dirty` if there are uncommitted changes).
3. Ships the images and the compose and gateway files.
4. Renews the certificate and reloads the gateway.
5. **Dumps the database** (skip with `SKIP_BACKUP=1`).
6. Restarts the stack.
7. Waits until `/badger-api/health` and `/badger/` answer over HTTPS.

The API applies pending EF Core migrations as it starts, so a healthy publish means a migrated database. If the health check fails, the script prints the API and gateway logs and exits non-zero. It doesn't roll back, but the previous three image builds stay on the Pi.

The data lives in the named volume `relentlessbadger_pgdata`; the compose project name is pinned, so it survives every publish. If the Pi already has a `relentlessbadger-db` container from an earlier manual deploy on a different volume, the script stops without changing anything, because starting next to it would come up on an empty database. To carry that data over: `pg_dump` it, stop the old stack, publish, then restore as below.

Point the Android app at the Pi with `./gradlew assembleDebug -PBADGER_API_BASE_URL=https://<pi>.ts.net/badger-api`.

### Back up and restore

```bash
deploy/backup.sh
```

This takes a `pg_dump` (custom format) into the folder the Postgres container shares with the host (`~/relentlessbadger/backups`, or `BACKUP_DIR` in the Pi's `.env`) and keeps the newest `BACKUP_KEEP` (default 14). To restore a dump, on the Pi:

```bash
docker exec relentlessbadger-db pg_restore --clean --if-exists -U badger -d relentlessbadger /backups/<file>.dump
```

Tailscale certificates last 90 days, and each publish renews it. To cover long gaps between publishes, add this to the Pi's crontab (`crontab -e`):

```
0 4 * * 1 tailscale cert --cert-file ~/gateway/certs/fullchain.pem --key-file ~/gateway/certs/privkey.pem <pi>.ts.net && docker exec gateway nginx -c /etc/nginx/gateway/nginx.conf -s reload
```

### Adding another app to the gateway

The gateway (`deploy/gateway/`, installed at `~/gateway`) is its own compose project, so other apps can share port 443. An app adds `~/gateway/nginx/sites/<app>.conf` with its `location` blocks, attaches its containers to the external `gateway` Docker network, and reloads nginx. Upstreams are addressed through variables (see [`badger.conf`](deploy/gateway/nginx/sites/badger.conf)) so the gateway keeps running while any one app is down. Publishing this repo rewrites only `badger.conf`, `nginx.conf` and the gateway's compose file.

## Configuration

| Setting | Development | Production / CI |
|---|---|---|
| App: API base URL | `BADGER_API_BASE_URL` in `android/gradle.properties` (dev.sh bakes `http://localhost:5000` for the emulator) | `-PBADGER_API_BASE_URL=...` or env `ORG_GRADLE_PROJECT_BADGER_API_BASE_URL` |
| App: Google client ID | `BADGER_GOOGLE_WEB_CLIENT_ID` in `android/gradle.properties` | `-P` flag or env `ORG_GRADLE_PROJECT_BADGER_GOOGLE_WEB_CLIENT_ID` |
| Web: API base URL + Google client ID | `web/src/environments/environment.development.ts` | `environment.ts`, written at image build time by `web/Dockerfile` (`/badger-api`, `GOOGLE_WEB_CLIENT_ID` in `deploy/deploy.env`) |
| API: allowed browser origins | `Cors:AllowedOrigins` in `appsettings.Development.json` | none needed behind the gateway (same origin); `WEB_ORIGIN` in `.env` for a web app hosted elsewhere |
| Deploy target (ssh, Tailscale name, backups) | — | `deploy/deploy.env` (see `deploy/deploy.env.example`) |
| API: any appsettings key | `appsettings.Development.json` | env vars with `__` as the separator (e.g. `Jwt__Key`, `ConnectionStrings__Default`) — see `docker-compose.prod.yml` / `.env.example` |

## API

| Method | Route | Purpose |
|---|---|---|
| POST | `/auth/google` | exchange a Google ID token for an app JWT |
| GET/PUT | `/me/settings` | default initial delay + repeat interval |
| GET | `/tasks?status=open\|done\|all` | list tasks |
| POST | `/tasks` | create a task `{"title": "..."}`; accepts an optional client-minted `id` (idempotent), `createdAt` and delay overrides so offline creates push faithfully |
| POST | `/tasks/{id}/complete` | mark done |
| DELETE | `/tasks/{id}` | delete |
| GET | `/tasks/titles` | distinct past titles (frequency-ordered) feeding the fuzzy autocomplete |

## Tests

```bash
cd backend && dotnet test        # API integration tests (in-memory SQLite, fake Google validator)
cd android && ./gradlew test     # BDD scenario suite + unit tests (JVM/Robolectric, no emulator)
cd web && npm test               # the same scenario suite, ported (Vitest)
```

The Android suite is scenario-driven (`app/src/test/.../scenario/`): Given/When/Then tests run the real repository on an in-memory Room database with the network, clock and alarms faked, covering every feature online and offline — create/disable while offline, queue flush on reconnect, sync merge and prune safety, settings last-write-wins, boot re-arm, 401 recovery, and the Room migration.

The web suite is that same suite, ported scenario for scenario (`web/src/app/core/**/*.scenario.spec.ts`) onto the same seams — a real repository over a real store, with a Map standing in for localStorage. Behaviour parity between the two clients is therefore checked by the tests, not by inspection.

## Repo layout

```
├── docker-compose.yml            # dev: PostgreSQL 17 only
├── docker-compose.prod.yml       # prod: PostgreSQL + API + web containers (see .env.example)
├── deploy/
│   ├── publish.sh                # build, ship and roll out to the Pi over ssh
│   ├── backup.sh                 # pg_dump on the Pi into the shared backups folder
│   └── gateway/                  # HTTPS nginx on the Pi (/badger, /badger-api)
├── backend/
│   ├── Dockerfile                # multi-arch (amd64/arm64) API image
│   ├── RelentlessBadger.Api/    # minimal-API endpoints, EF Core + Npgsql, JWT auth
│   └── RelentlessBadger.Api.Tests/
└── android/
    └── app/src/main/java/com/relentlessbadger/app/
        ├── data/                 # Retrofit client, DataStore session, offline-first repository
        ├── db/                   # Room source of truth: open tasks (drives alarms) + title history
        ├── fuzzy/                # fzf-style matcher for quick-add suggestions
        ├── notify/               # AlarmManager scheduling, receivers, notifications
        ├── sync/                 # WorkManager background sync (pushes queued changes on reconnect)
        └── ui/                   # Compose Material 3 screens
└── web/
    ├── Dockerfile                # PWA image: ng build under /badger/, served by nginx
    └── src/app/
        ├── core/domain/          # framework-free rules: scheduling, recurrence, calendar, fuzzy match
        ├── core/data/            # localStorage database, DAOs, API client, the ported repository
        ├── core/notify/          # timers + service-worker notifications (the alarm layer's stand-in)
        ├── core/sync/            # connectivity-aware sync scheduler (WorkManager's stand-in)
        ├── core/testing/         # fakes + Given/When/Then harness, ported from the Android tests
        └── ui/                   # Angular Material screens
```
