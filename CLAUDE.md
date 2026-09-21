# RelentlessBadger

A persistent-reminder to-do app: tasks are fast to add, and the app nags with
notifications until they are marked done.

- `backend/` — .NET 10 Web API + PostgreSQL. Its only job is syncing devices.
- `android/` — native Kotlin, Jetpack Compose + Material 3.
- `web/` — Angular + Angular Material PWA.

Both clients are **offline-first**: the local database (Room / IndexedDB) is the
source of truth, every mutation commits locally and is flagged for a later push
(`pendingCreate` / `pendingDone` / `pendingUpdate`), and reminders are local
alarms. The backend deliberately stores client semantics — recurrence above all —
without interpreting them: the client owns the schedule maths and spawns the next
occurrence itself.

## Keep the two frontends at parity

**Every user-facing feature must land in both the Android app and the web PWA in
the same change.** They are deliberate mirrors of each other, not independent
products: the same repository method names, the same domain helpers
(`computeNextFire`, `computeNextOccurrence`, …), the same row affordances and
labels. A feature added to one and not the other is an unfinished feature.

The same goes for tests. Behaviour lives in the repository layer and is covered
by the Given/When/Then scenario suites — `android/app/src/test/.../scenario/` and
`web/src/app/core/data/*.scenario.spec.ts` — which are ports of each other; the
web specs carry a `// Ported from <Name>Scenarios.kt.` header. Add the scenario on
both sides.

## Conventions

- Compose UI labels are hardcoded English literals; `strings.xml` is only for the
  app name and notification actions. Icons come from `Icons.Filled.*`.
- Comments explain *why*, not what — see the existing KDoc/TSDoc for the register.

## Running things

- `./dev.sh` starts Postgres, the API and an emulator, then builds and installs
  the app. `./dev.sh down` stops everything.
- Tests: `cd android && ./gradlew test`; `cd web && npm test`; `cd backend && dotnet test`.
- Production is a Raspberry Pi: `deploy/publish.sh` ships the current tree (HTTPS gateway,
  `/badger` + `/badger-api`), `deploy/backup.sh` dumps its database. See the README.
