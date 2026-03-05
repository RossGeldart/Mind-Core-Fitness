# Project: Mind Core Fitness

## Build

- After ANY source changes in `admin/`, always run BOTH builds from `admin/`:
  1. **iOS build:** `VITE_CAPACITOR=true npm run build && npx cap sync ios` — outputs to `dist/` and syncs to iOS
  2. **Web build:** `npm run build` — outputs to `login/` folder
- The `VITE_CAPACITOR=true` flag sets `base: '/'` and `outDir: 'dist'` (see `admin/vite.config.js`). Without it, assets use `/login/` paths which break on native.
- Always run the web build LAST so `login/` has the correct output for commit
- Always commit the `login/` build output alongside source changes
