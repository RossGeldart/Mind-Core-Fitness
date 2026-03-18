# Mind Core Fitness

## Rules

### Workflow
- **Single-branch workflow**: All development happens on `main`. No separate feature branches for platforms.
- iOS-specific code is guarded with `Capacitor.isNativePlatform()` — safe on `main`.

### Build (required after ANY source changes in `admin/`)
Run both builds from `admin/`, in this order:
1. `VITE_CAPACITOR=true npm run build && npx cap sync ios` — iOS build to `dist/`
2. `npm run build` — web build to `login/`

- Web build MUST run last so `login/` has correct output
- Always commit `login/` build output alongside source changes

### Tests & Lint
- Run `npm test` from `admin/` before committing
- Run `npm run lint` from `admin/` to check for lint errors

### Auth — DO NOT break either flow
- **Web**: `signInWithPopup` (Google/Apple) — do NOT change
- **iOS native**: `@capacitor-firebase/authentication` with `skipNativeAuth: true` → `signInWithCredential` bridge
- Apple/Google sign-in users skip email verification (only `signupSource: 'self_signup'` needs it)
- Always guard native code with `Capacitor.isNativePlatform()`

### Off-limits
- `admin/ios/` — managed by Xcode, do not edit directly
- `admin/android/` — managed by Android Studio, do not edit directly
- `.env*` files — never commit secrets

## Key Architecture

See `.claude/architecture.md` for full details. Quick reference:

- **App**: React 19 + Vite, runs as web app and Capacitor iOS/Android app
- **Backend**: Firebase Cloud Functions (`functions/`), Stripe API routes (`api/`)
- **Auth**: Firebase Auth — web popup + native credential bridge
- **Data**: Firestore — see architecture doc for collection schemas
- **AI**: Claude Haiku via `analyseMeal` Cloud Function for meal scanning

- **Payments**: RevenueCat for IAP, Stripe for web
