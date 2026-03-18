# Architecture Reference

## Project Structure

```
admin/                  # Main React/Vite app
  src/
    pages/              # Full page components (Login, Dashboard, AIMealScanner, etc.)
    components/         # Reusable UI components
    contexts/           # React contexts (Auth, Theme, Tier)
    services/           # Service layer (healthData, revenueCat)
    hooks/              # Custom React hooks
    config/             # Firebase, Stripe, RevenueCat, Mixpanel config
    utils/              # Utility functions + tests
  ios/                  # Capacitor iOS project (Xcode-managed)
  android/              # Capacitor Android project
functions/              # Firebase Cloud Functions (Node 20)
api/                    # Stripe webhook/API routes
```

## Tech Stack
- **Frontend**: React 19, Vite, React Router 7
- **Native**: Capacitor (iOS + Android)
- **Backend**: Firebase Cloud Functions, Firebase Admin SDK
- **Database**: Firestore
- **Auth**: Firebase Auth (web popup + native credential bridge)
- **AI**: Anthropic Claude Haiku SDK (`@anthropic-ai/sdk`) in Cloud Functions
- **Analytics**: Mixpanel
- **Payments**: RevenueCat (native IAP), Stripe (web)
- **Health**: `@capgo/capacitor-health` (HealthKit + Health Connect)
- **Testing**: Vitest + React Testing Library (jsdom)
- **Linting**: ESLint 9 flat config with React plugins

## Firestore Collections
- `nutritionLogs/{clientId}_{date}` — daily meal entries with macros
- `nutritionTargets/{clientId}` — daily macro targets
- `savedMeals/{clientId}` — AI scanner cached meals
- `scanUsage/{clientId}_{date}` — daily AI scan counter
- `healthData/{userId}_{date}` — raw HealthKit/Health Connect data synced from device

## Key Integrations

### AI Meal Scanner
- `admin/src/pages/AIMealScanner.jsx` — photo capture UI
- `functions/index.js` → `analyseMeal` — Claude Haiku processes food photos
- Flow: photo → Claude analysis → macro breakdown → logged to `nutritionLogs`
- Saved meals library for quick re-logging, 10 scans/day limit

### Health Data Sync
- Service: `admin/src/services/healthDataService.js`
- Reads: steps, sleep (with stages), active calories
- Syncs on app open and resume (via AuthContext)
- Writes to `healthData/{clientId}_{date}`
- Native only — web has no health data (manual entry only)

### Build System
- `VITE_CAPACITOR=true` sets `base: '/'` and `outDir: 'dist'` (native build)
- Without the flag: `base: '/login/'` and `outDir: '../login'` (web build)
- Config: `admin/vite.config.js`
