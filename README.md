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

## Deploy the API with Docker (e.g. Raspberry Pi)

`backend/Dockerfile` builds a container image of the API for both `amd64` and `arm64`, and `docker-compose.prod.yml` runs it together with PostgreSQL. On the Pi (or any Docker host):

```bash
git clone <this-repo> && cd RelentlessBadger
cp .env.example .env        # then fill in POSTGRES_PASSWORD, JWT_KEY, GOOGLE_CLIENT_ID
docker compose -f docker-compose.prod.yml up -d --build
curl http://localhost:5000/health
```

`--build` compiles natively on the host (arm64 on a Pi), and migrations apply automatically on startup. Postgres is not exposed outside the compose network; only the API's port 5000 is published.

Alternatively, build the multi-arch image on a faster machine and push it to a registry — the SDK stage cross-compiles, so no emulation is involved:

```bash
docker buildx build --platform linux/amd64,linux/arm64 \
  -t ghcr.io/<you>/relentlessbadger-api --push backend/
```

Then on the Pi set `API_IMAGE=ghcr.io/<you>/relentlessbadger-api` in `.env` and run `up -d` without `--build`. The same `buildx` command is what a CI/CD pipeline would run to publish the image.

## Configuration

| Setting | Development | Production / CI |
|---|---|---|
| App: API base URL | `BADGER_API_BASE_URL` in `android/gradle.properties` (dev.sh bakes `http://localhost:5000` for the emulator) | `-PBADGER_API_BASE_URL=...` or env `ORG_GRADLE_PROJECT_BADGER_API_BASE_URL` |
| App: Google client ID | `BADGER_GOOGLE_WEB_CLIENT_ID` in `android/gradle.properties` | `-P` flag or env `ORG_GRADLE_PROJECT_BADGER_GOOGLE_WEB_CLIENT_ID` |
| Web: API base URL + Google client ID | `web/src/environments/environment.development.ts` | `web/src/environments/environment.ts` (build-time) |
| API: allowed browser origins | `Cors:AllowedOrigins` in `appsettings.Development.json` | `Cors__AllowedOrigins__0` / `WEB_ORIGIN` in `.env` |
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
├── docker-compose.prod.yml       # prod: PostgreSQL + API containers (see .env.example)
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
    └── src/app/
        ├── core/domain/          # framework-free rules: scheduling, recurrence, calendar, fuzzy match
        ├── core/data/            # localStorage database, DAOs, API client, the ported repository
        ├── core/notify/          # timers + service-worker notifications (the alarm layer's stand-in)
        ├── core/sync/            # connectivity-aware sync scheduler (WorkManager's stand-in)
        ├── core/testing/         # fakes + Given/When/Then harness, ported from the Android tests
        └── ui/                   # Angular Material screens
```
