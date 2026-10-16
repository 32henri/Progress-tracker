# Progress Tracker

A personal, gamified progress-tracking app — turns tasks, habits, vices, skills, goals, and
workouts into an RPG-style character sheet (stats, XP, levels, streaks). Single-user, built
as an installable PWA.

## Tech stack

- **React 19** + **Vite 8**
- **Tailwind CSS v4** (via `@tailwindcss/vite`)
- **Firebase** — Auth (email/password) + Firestore (data sync)
- **vite-plugin-pwa** — installable, offline-capable, with a service worker
- **lucide-react** — icons
- Optional **Gemini API** for smarter task-to-skill/stat classification (falls back to a
  built-in heuristic classifier if no key is set)

## Getting started

```bash
npm install
npm run dev      # starts the Vite dev server with HMR
```

Other scripts:

```bash
npm run build     # production build -> dist/
npm run preview   # locally preview the production build
npm run lint       # oxlint
```

### Firebase setup

`src/lib/firebase.js` contains the Firebase project config (API key, project ID, etc.).
This is safe to be public — Firebase client config isn't a secret, access control is
enforced by your **Firestore security rules**, which should restrict each user's document
to `request.auth.uid == uid`. If you point this at your own Firebase project, swap in your
own config and make sure those rules are set.

Note: your Gemini API key (if you set one in-app) is stored in the same synced Firestore
document as the rest of your data, so the security rules above are what protect it too —
there's no separate secret store.

## How it's organized

```
src/
  main.jsx            entry point, mounts <AppShell />
  AppShell.jsx         top-level gate: login -> device-mode picker -> ProgressTracker
  ProgressTracker.jsx   the app itself — all 7 tabs, state, and domain logic
  lib/
    firebase.js         Firebase app/auth/Firestore init
    auth.js             login / register / logout / watchAuth
    storage.js           Firestore sync layer (in-memory cache + debounced writes)
    deviceMode.js         local "is this my phone or my PC" flag
    aiStatus.js            pub-sub for which AI classification path last ran
public/               icons, manifest assets
```

### `AppShell.jsx`

Decides what to render: an auth check spinner, the login/register screen, a one-time
per-device prompt ("My Phone" = full editing, "My PC" = view-only), or the main app.
Device mode is stored in `localStorage`, not synced — it's a property of the browser, not
the account.

### `ProgressTracker.jsx`

The main app, in one file. Roughly top to bottom:

1. **Domain logic** — XP thresholds and level curves, streak and decay math for habits and
   skills, stat derivation, 1RM estimation. Plain functions, no React.
2. **AI classification helpers** — turning free-text entries into skill/stat assignments,
   with a heuristic fallback when no Gemini key is configured.
3. **Shared UI pieces** — `Bar`, `Card`, `CircularStat`, `MidnightCountdown`, etc.
4. **`OnboardingWizard`** — first-run setup.
5. **`TABS`** — the 7 tabs: Today, Goals, Habits, Vices, Skills, Workouts, Week.
6. **`ProgressTracker`** (default export) — owns all app state, loads it via
   `storage.js`, and renders the active tab.
7. **One view component per tab** — `GoalsView`, `HabitsView`, `VicesView`, `SkillsView`,
   `WorkoutsView` (+ `ExercisePage`), `WeekView`.

### `lib/storage.js`

Pulls the user's whole Firestore document into an in-memory cache on `initStore(uid)`, so
every subsequent read is synchronous; writes are debounced back up to Firestore. Also
handles a one-time migration of a couple of fields that used to be device-local only.

## Deploying

`npm run build` produces `dist/`, ready to deploy as a static site (e.g. to Netlify) —
Firebase Auth/Firestore calls work the same from any static host since they're
client-side.

## Versioning note

Output builds for this project follow a manual version suffix
(`progress-tracker-dist-vN.zip`, `progress-tracker-source-vN.zip`) rather than relying on
git history — see `CONTINUE-THIS-PROJECT.md` for the handoff process between sessions.
