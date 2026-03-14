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

## Health Coaching System — Implementation Plan

The goal is to transform Core Buddy from a tracking tool into a proactive AI health coach that analyses the user's entire biology, life choices, and daily patterns to provide personalised guidance.

### Three-Step Implementation Order

**Step 1: Fix the Meal Scanner (FIRST)**
- The AI meal scanner already exists (`AIMealScanner.jsx`, Cloud Function `analyseMeal` using Claude)
- It needs to be made fully functional: photo capture → Claude analysis → proper macro logging to Firestore `nutritionLogs`
- This establishes the "calories in" pipeline before anything else

**Step 2: Smartwatch Integration (SECOND)**
- Integrate HealthKit (iOS) and Health Connect (Android) via Capacitor plugins
- Data to read: sleep (duration, stages, bed/wake times), heart rate, HRV, resting HR, steps, active calories, menstrual cycle data
- Guard with `Capacitor.isNativePlatform()` — web falls back to manual input only
- Store health data in Firestore for AI analysis
- This establishes the "calories out" + biological data pipeline

**Step 3: Build the AI Health Coach (THIRD)**
- Requires Step 1 (nutrition data) and Step 2 (body/activity data) to be working
- Components to build:
  1. **Recovery scoring engine** — weighted formula: sleep (30%), HRV vs baseline (25%), resting HR vs baseline (15%), training load last 48hrs (15%), nutrition compliance (10%), self-reported soreness (5%)
  2. **Morning/evening check-in flow** — quick tap-based inputs (energy 1-5, mood, stress, soreness body map). Pre-fills sleep data from HealthKit/Health Connect. Must be under 30 seconds
  3. **Real-time energy balance** — live calories in vs calories out throughout the day. Macro targets shift dynamically as user moves and eats. Progress bars update in real time
  4. **4-hour coaching blocks** — AI generates guidance for the next 4 hours based on current state: what to eat, when to eat, whether to train, hydration nudges. Delivered via notification or in-app card
  5. **Daily plan generation** — Claude receives full context payload (profile, 7-14 day trends, today's check-in, scheduled workout, recovery score) and returns personalised plan
  6. **Pattern memory system** — Firestore `dailySnapshots/{userId}_{date}` stores full day records with AI-generated tags. When generating advice, query similar past situations and include outcomes so AI can say "last time this happened, here's what worked/didn't"
  7. **Live macro shifting** — recalculate remaining macro targets every time new data arrives (meal logged, workout completed, steps updated)
  8. **Smart notifications** — context-aware nudges, not spam. Hydration reminders, meal timing advice, rest day enforcement, streak protection messaging

### Key Design Principles
- **Manual-first, watch-second**: Everything must work with manual input only. Watch data is a bonus that auto-fills fields
- **Under 30 seconds**: Morning/evening check-ins must be fast tap-based interactions or users won't do them daily
- **Personal baselines**: AI learns each user's normal HRV, resting HR, sleep patterns — compares to THEIR baseline, not population averages
- **Recovery > streaks**: The AI should protect users from overtraining. Rest days count toward streaks. "Rest IS training"
- **Contextual nutrition**: Not static daily targets. Advice shifts based on training schedule, yesterday's intake, cycle phase, stress levels, and time of day
- **Pattern memory**: After weeks of data, AI spots recurring patterns (e.g. "you always under-eat on Saturdays", "your Wednesday sessions suffer when Tuesday nutrition drops off")

### Data Architecture (New Firestore Collections)
- `dailyCheckIns/{userId}_{date}` — morning/evening check-in data (sleep, energy, mood, stress, soreness, hydration, HRV, resting HR, recovery score, cycle day)
- `dailySnapshots/{userId}_{date}` — full day summary with AI-generated tags for pattern matching and next-day outcomes
- `coachingInsights/{userId}_{date}` — cached AI coaching responses for the day (morning plan, 4-hour block advice)
- `healthData/{userId}_{date}` — raw HealthKit/Health Connect data synced from device

### Technical Notes
- Claude API already integrated for meal scanning — same pattern for coaching prompts
- Cloud Functions for scheduled coaching generation (after morning check-in)
- Push notifications already wired up (FCM) — just need smarter content
- HealthKit/Health Connect data is on-device — read and sync to Firestore, don't depend on cloud for access
- Web app supports manual-only check-ins; native apps get auto-fill from health APIs
- Coaching system prompt gives Claude a personality: encouraging but honest, never preachy, backs up advice with user's own data
