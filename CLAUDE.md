# Project: Mind Core Fitness

## Workflow

- **Single-branch workflow**: All development (web + iOS) happens on `main`. There is NO separate iOS branch.
- iOS-specific code is guarded with `Capacitor.isNativePlatform()` checks, so it's safe on `main`.
- Every session that makes source changes should run both builds before committing (see Build section).

## Build

- After ANY source changes in `admin/`, always run BOTH builds from `admin/`:
  1. **iOS build:** `VITE_CAPACITOR=true npm run build && npx cap sync ios` — outputs to `dist/` and syncs to iOS
  2. **Web build:** `npm run build` — outputs to `login/` folder
- The `VITE_CAPACITOR=true` flag sets `base: '/'` and `outDir: 'dist'` (see `admin/vite.config.js`). Without it, assets use `/login/` paths which break on native.
- Always run the web build LAST so `login/` has the correct output for commit
- Always commit the `login/` build output alongside source changes

## Auth / Native iOS

- The app runs as a web app AND as a Capacitor iOS app. All auth changes MUST preserve both flows.
- **Web**: Uses `signInWithPopup` (Google/Apple providers) — do NOT change this path.
- **iOS native**: Uses `@capacitor-firebase/authentication` with `skipNativeAuth: true`. The plugin handles the OAuth UI natively, then returns a credential which is bridged to the JS Firebase SDK via `signInWithCredential`. This keeps the JS SDK's `onAuthStateChanged` in sync.
- Apple/Google sign-in users do NOT need email verification — that gate only applies to `signupSource: 'self_signup'`.
- Always guard native-only code with `Capacitor.isNativePlatform()` checks to avoid breaking the web flow.

## AI Meal Scanner — DONE ✅
- AI meal scanner fully functional: `AIMealScanner.jsx` + `analyseMeal` Cloud Function (Claude Haiku)
- Photo capture → Claude analysis → macro breakdown → logged to Firestore `nutritionLogs`
- Saved meals library for quick re-logging, 10 scans/day limit, source tracking

## Apple Health / Health Connect Integration
- Uses `@capgo/capacitor-health` plugin for iOS HealthKit and Android Health Connect
- Health data sync service: `admin/src/services/healthDataService.js`
- Reads: steps, sleep (with stages), active calories
- Syncs on app open and app resume (via AuthContext)
- Writes to Firestore `healthData/{clientId}_{date}`
- Guarded with `Capacitor.isNativePlatform()` — web gets no health data (manual-only)
- **iOS and Android only** — no web smartwatch support

### Data Architecture (Firestore Collections)
- `nutritionLogs/{clientId}_{date}` — daily meal entries with macros
- `nutritionTargets/{clientId}` — daily macro targets
- `savedMeals/{clientId}` — AI scanner cached meals
- `scanUsage/{clientId}_{date}` — daily AI scan counter
- `healthData/{userId}_{date}` — raw HealthKit/Health Connect data synced from device

### Technical Notes
- Claude API integrated for meal scanning (`analyseMeal`) — uses Claude Haiku
- HealthKit/Health Connect data is on-device — read and sync to Firestore, don't depend on cloud for access
