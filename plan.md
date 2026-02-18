# Habits Card Polish — Industry Alignment Fixes

## 1. Dim incomplete habit icons
**File:** `CoreBuddyConsistency.css`
- Add `opacity: 0.4` and `filter: grayscale(0.3)` to `.cbc-habit-ring-icon` (default/incomplete state)
- Override to `opacity: 1` and `filter: brightness(1.3)` on `.cbc-ring-completed .cbc-habit-ring-icon` (already exists but needs the opacity reset)
- This creates the strong done/not-done contrast that Apple, Streaks, and Habitify all use

## 2. Bump font sizes to industry standards
**File:** `CoreBuddyConsistency.css`
- `.cbc-habit-label`: `0.75rem` → `0.85rem` (habit name — industry minimum is 16pt)
- `.cbc-habit-hold-hint`: `0.6rem` → `0.68rem` (status text — below caption minimum)
- `.cbc-habit-done-tag`: `0.6rem` → `0.68rem` (same treatment)
- `.cbc-section-title`: `0.9rem` → `1rem` (section headings need more presence)

## 3. Increase tile horizontal padding
**File:** `CoreBuddyConsistency.css`
- `.cbc-habit-tile` padding: `20px 10px 16px` → `20px 14px 16px` (10px feels cramped vs 16px industry standard)

## 4. Bump icon stroke width
**File:** `CoreBuddyConsistency.jsx`
- Change `strokeWidth="1.5"` → `strokeWidth="2"` on the habit ring icon SVG (line 650)
- Strava uses 2px at 24px size, 2.5px at 32px — our 32px icons should use at least 2

## 5. More vibrant dark mode habit colors
**File:** `CoreBuddyConsistency.jsx`
- Update DEFAULT_HABITS to include a `darkColor` variant per habit with higher saturation
- Trained: `#A12F3A` → dark: `#E8475A` (brighter, more vibrant red)
- Protein: `#4caf50` → dark: `#5CDB61` (lifted green)
- Steps: `#ff9800` → dark: `#FFB020` (warmer, brighter orange)
- Sleep: `#7c3aed` → dark: `#9B5AF2` (lifted to match iOS systemPurple dark)
- Water: `#2196f3` → dark: `#42A5F5` (brighter blue)

**File:** `CoreBuddyConsistency.jsx`
- In the render, use `isDark ? habit.darkColor : habit.color` for all color references (ring stroke, icon color, glow orb, particle color, weekly dots)

No changes to light mode colors — they're fine as-is with Material palette on white backgrounds.
