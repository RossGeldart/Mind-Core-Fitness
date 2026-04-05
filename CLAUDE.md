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

### Theming — 4 theme combinations must all work
The app has **4 theme combinations**: light, dark, light+mono, dark+mono
(controlled by `data-theme` and `data-mono` attributes on the root element).
Any new card / overlay / modal MUST be checked in all 4.

**CSS rules — never hardcode, always use theme tokens:**
- **Text on primary-colored backgrounds** → `var(--text-on-primary)`, NOT `#fff`.
  Mono dark has `--color-primary: #f0f0f0` (near-white), so `color: #fff` on an
  active button = white on white = invisible.
- **Overlay backdrops** → `var(--overlay-bg)`, NOT hardcoded `rgba(0,0,0,0.x)`.
  Dark mono needs 0.85+ opacity; hardcoded 0.4 disappears on dark backgrounds.
- **Card backgrounds in mono themes** → Do NOT rely on `var(--bg-card)` alone.
  In mono light it's `rgba(255,255,255,0.55)` and in mono dark it's
  `rgba(255,255,255,0.05)` — far too transparent. Add explicit opaque
  backgrounds via `[data-mono="true"][data-theme="light"]` and
  `[data-mono="true"][data-theme="dark"]` selectors (pattern: ~0.88-0.95 opacity
  + backdrop-filter blur). See `theme.css` lines 290-340 for examples.
- **Modals / pickers / overlays** should always define opaque backgrounds in
  all 4 theme variants. See `.cbm-overlay-card`, `.notif-panel`, `.login-card`
  in `theme.css` for the reference pattern.

**Z-index for overlays**: FAB is at 1000, leaderboard modal at 2000. New
overlays should use **2050+** to layer above both.

**Token reference** — see `src/styles/theme.css`:
- `--bg-card`, `--bg-card-elevated` (transparent in mono)
- `--overlay-bg`, `--overlay-bg-heavy` (theme-aware)
- `--text-primary`, `--text-secondary`, `--text-tertiary`, `--text-on-primary`
- `--color-primary`, `--border-color`, `--shadow-glow`

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
