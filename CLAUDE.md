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
