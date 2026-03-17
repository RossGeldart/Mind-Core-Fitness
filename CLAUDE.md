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

**Step 1: Fix the Meal Scanner — DONE ✅**
- AI meal scanner fully functional: `AIMealScanner.jsx` + `analyseMeal` Cloud Function (Claude Haiku)
- Photo capture → Claude analysis → macro breakdown → logged to Firestore `nutritionLogs`
- Saved meals library for quick re-logging, 10 scans/day limit, source tracking
- "Calories in" pipeline established

**Step 2: Smartwatch Integration — IN PROGRESS 🔧**
- Integrate HealthKit (iOS) and Health Connect (Android) via Capacitor plugins
- Data to read: sleep (duration, stages, bed/wake times), heart rate, HRV, resting HR, steps, active calories, menstrual cycle data
- Guard with `Capacitor.isNativePlatform()` — web falls back to manual input only
- Store health data in Firestore `healthData/{userId}_{date}` collection (rules already in place)
- This establishes the "calories out" + biological data pipeline
- **iOS and Android only** — no web smartwatch support

**Step 3: Build the AI Health Coach — BACKEND DONE ✅, FRONTEND PENDING ⏳**
- Backend Cloud Functions completed (in `functions/index.js`):
  1. **`calculateRecoveryScore`** — weighted formula: sleep 30%, HRV 25%, resting HR 15%, training load 15%, nutrition 10%, soreness 5%. Returns score 0-100, grade, and recommendation. Saves to `dailyCheckIns`.
  2. **`generateCoachingPlan`** — Claude receives full user context (profile, check-in, nutrition, habits, 7-day history) and returns personalised daily plan with 4-hour coaching blocks, adjusted macros, and training advice. Cached in `coachingInsights`.
  3. **`generateDailySnapshot`** + **`scheduledDailySnapshot`** (11 PM UK) — aggregates full day data, Claude generates tags (e.g. "under_ate", "poor_sleep") and outcome summary. Stored in `dailySnapshots`.
  4. **`analyseMealWithContext`** — enhanced meal scanner that also shows how the meal fits remaining daily macro targets.
  5. **`middayCoachingNudge`** (1 PM UK) — context-aware push notification based on nutrition progress and recovery score.
  6. **`findSimilarDays`** — pattern memory: queries past snapshots by tags to find similar days and their outcomes.
- Frontend service wrapper: `admin/src/services/coachingService.js`
- Firestore rules for `dailyCheckIns`, `dailySnapshots`, `coachingInsights`, `healthData` — all done
- **Still needed (frontend UI):**
  - Morning/evening check-in flow (quick tap-based, under 30 seconds, pre-fills from HealthKit/Health Connect)
  - Coaching plan display (daily overview + 4-hour block cards)
  - Recovery score widget on dashboard
  - Real-time energy balance (calories in vs out, live macro progress bars)
  - Live macro shifting (recalculate targets when new data arrives)

### Next Steps (in order)
1. **Complete Step 2: Smartwatch Integration** — install Capacitor HealthKit + Health Connect plugins, build a health data sync service, auto-sync on app open and periodically, write to `healthData/{userId}_{date}` in Firestore
2. **Build Step 3 frontend UI** — check-in screens, coaching plan view, recovery widget, energy balance display
3. **Wire it all together** — check-in pre-fills from health data, coaching plan uses real biometric data, smart notifications reference actual patterns

### Key Design Principles
- **Manual-first, watch-second**: Everything must work with manual input only. Watch data is a bonus that auto-fills fields
- **Under 30 seconds**: Morning/evening check-ins must be fast tap-based interactions or users won't do them daily
- **Personal baselines**: AI learns each user's normal HRV, resting HR, sleep patterns — compares to THEIR baseline, not population averages
- **Recovery > streaks**: The AI should protect users from overtraining. Rest days count toward streaks. "Rest IS training"
- **Contextual nutrition**: Not static daily targets. Advice shifts based on training schedule, yesterday's intake, cycle phase, stress levels, and time of day
- **Pattern memory**: After weeks of data, AI spots recurring patterns (e.g. "you always under-eat on Saturdays", "your Wednesday sessions suffer when Tuesday nutrition drops off")

### Data Architecture (Firestore Collections)
- `nutritionLogs/{clientId}_{date}` — daily meal entries with macros ✅ (existing)
- `nutritionTargets/{clientId}` — daily macro targets ✅ (existing)
- `savedMeals/{clientId}` — AI scanner cached meals ✅ (existing)
- `scanUsage/{clientId}_{date}` — daily AI scan counter ✅ (existing)
- `dailyCheckIns/{userId}_{date}` — morning/evening check-in data + recovery scores ✅ (rules + backend ready)
- `dailySnapshots/{userId}_{date}` — full day summary with AI-generated tags ✅ (rules + backend ready)
- `coachingInsights/{userId}_{date}` — cached AI coaching responses ✅ (rules + backend ready)
- `healthData/{userId}_{date}` — raw HealthKit/Health Connect data synced from device ✅ (rules ready, sync service needed)

### Technical Notes
- Claude API integrated for meal scanning (`analyseMeal`) and coaching (`generateCoachingPlan`, `generateDailySnapshot`) — all use Claude Haiku
- Cloud Functions for scheduled coaching: `scheduledDailySnapshot` (11 PM), `middayCoachingNudge` (1 PM)
- Push notifications wired up (FCM) with smart coaching content via `middayCoachingNudge`
- HealthKit/Health Connect data is on-device — read and sync to Firestore, don't depend on cloud for access
- Web app supports manual-only check-ins; native apps get auto-fill from health APIs
- Coaching system prompt gives Claude a personality: encouraging but honest, never preachy, backs up advice with user's own data
- Frontend service layer (`coachingService.js`) wraps all Cloud Functions for easy component integration
