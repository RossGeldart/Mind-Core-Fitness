# Solo Challenges — Implementation Plan

## Overview
Add a Solo Challenges feature to Core Buddy. Users pick a challenge, get locked in for its duration, and see a progress ring fill as they complete workouts/habits. Progress is computed from existing `workoutLogs` and `habitLogs` data — no new logging needed.

---

## 1. Challenge Config File

**New file:** `admin/src/config/challengeConfig.js`

Define 6 starter challenges as a static array:

```js
export const CHALLENGES = [
  {
    id: 'starter_streak',
    name: 'Starter Streak',
    description: 'Complete 5 workouts in 7 days',
    goal: 5,
    duration: 7,          // days
    type: 'workouts',     // metric to track
    difficulty: 'easy',
    icon: 'flame',        // icon key for UI
    premium: false,
  },
  {
    id: 'consistency_king',
    name: 'Consistency King',
    description: 'Complete 12 workouts in 30 days',
    goal: 12,
    duration: 30,
    type: 'workouts',
    difficulty: 'medium',
    icon: 'crown',
    premium: true,
  },
  {
    id: 'thirty_in_thirty',
    name: '30 in 30',
    description: 'Complete 30 workouts in 30 days',
    goal: 30,
    duration: 30,
    type: 'workouts',
    difficulty: 'hard',
    icon: 'fire',
    premium: true,
  },
  {
    id: 'minute_master',
    name: 'Minute Master',
    description: 'Train for 300 total minutes in 30 days',
    goal: 300,
    duration: 30,
    type: 'minutes',
    difficulty: 'medium',
    icon: 'clock',
    premium: true,
  },
  {
    id: 'habit_machine',
    name: 'Habit Machine',
    description: 'Hit all daily habits for 7 days straight',
    goal: 7,
    duration: 7,
    type: 'habits_perfect',  // days with all habits complete
    difficulty: 'medium',
    icon: 'check',
    premium: false,
  },
  {
    id: 'iron_will',
    name: 'Iron Will',
    description: 'Work out every day for 14 days straight',
    goal: 14,
    duration: 14,
    type: 'streak',       // consecutive workout days
    difficulty: 'hard',
    icon: 'shield',
    premium: true,
  },
];
```

**Why static config:** Challenges don't need to be in Firestore since they don't change per-user. Keeps reads low and is easy to extend later.

---

## 2. Firestore Data Model

**New collection:** `userChallenges`

One document per challenge attempt, doc ID auto-generated:

```js
{
  clientId: string,           // user's client doc ID
  challengeId: string,        // matches CHALLENGES[].id
  startDate: Timestamp,       // when user started
  endDate: Timestamp,         // startDate + duration days
  status: 'active' | 'completed' | 'failed',
  completedAt: Timestamp | null,
  badgeAwarded: boolean,
}
```

**No progress field** — progress is computed live by querying `workoutLogs` / `habitLogs` between `startDate` and now (or `endDate`). This avoids sync issues and reuses existing data.

---

## 3. Challenges Page Component

**New files:**
- `admin/src/pages/Challenges.jsx` (~350-400 lines estimated)
- `admin/src/pages/Challenges.css`

### Page States

**State A — No active challenge (browsing mode):**
- Header: "Challenges" with subtitle
- Grid of 6 challenge cards, each showing:
  - Icon (SVG inline, matching existing icon style)
  - Challenge name + description
  - Duration badge ("7 days", "30 days")
  - Difficulty tag (easy/medium/hard) with colour coding
  - Lock icon overlay on premium challenges for free users
- Tapping a card opens a confirmation modal: challenge details + "Start Challenge" button
- Free users tapping a premium challenge see the upgrade prompt

**State B — Active challenge (in progress):**
- Top section: large SVG progress ring (reuse the ring pattern from dashboard's 24hr countdown and stats rings)
  - Ring fills clockwise as progress increases
  - Centre shows fraction: "12 / 30" with label below
  - Ring colour: primary accent (#A12F3A)
- Below ring: info row with days remaining, current pace label ("On Track" / "Behind" / "Ahead")
- Challenge name + description shown below
- "Give Up" link (small, bottom) — confirms via modal, sets status to `failed`
- Below: greyed-out challenge grid with "Complete your current challenge first" note

**State C — Challenge just completed:**
- Ring at 100% with brief celebration (CSS pulse animation)
- "Challenge Complete!" heading
- Badge preview if applicable
- "Choose Next Challenge" button → transitions to State A

### Progress Computation (helper function)

```js
async function computeProgress(challenge, clientId, startDate) {
  const start = startDate;
  const now = Timestamp.now();

  switch (challenge.type) {
    case 'workouts': {
      const q = query(collection(db, 'workoutLogs'),
        where('clientId', '==', clientId),
        where('completedAt', '>=', start),
        where('completedAt', '<=', now));
      const snap = await getDocs(q);
      return snap.size;
    }
    case 'minutes': {
      const q = query(collection(db, 'workoutLogs'),
        where('clientId', '==', clientId),
        where('completedAt', '>=', start),
        where('completedAt', '<=', now));
      const snap = await getDocs(q);
      return snap.docs.reduce((sum, d) => sum + (d.data().duration || 0), 0);
    }
    case 'habits_perfect': {
      const q = query(collection(db, 'habitLogs'),
        where('clientId', '==', clientId));
      const snap = await getDocs(q);
      return snap.docs.filter(d => {
        const date = d.data().date;
        if (date < startDateStr || date > todayStr) return false;
        const h = d.data().habits || {};
        return Object.values(h).length > 0 && Object.values(h).every(v => v === true);
      }).length;
    }
    case 'streak': {
      const q = query(collection(db, 'workoutLogs'),
        where('clientId', '==', clientId),
        where('completedAt', '>=', start),
        where('completedAt', '<=', now));
      const snap = await getDocs(q);
      const dates = new Set(snap.docs.map(d =>
        d.data().completedAt.toDate().toISOString().slice(0, 10)));
      let streak = 0;
      let day = new Date(start.toDate());
      const today = new Date();
      while (dates.has(day.toISOString().slice(0, 10)) && day <= today) {
        streak++;
        day.setDate(day.getDate() + 1);
      }
      return streak;
    }
  }
}
```

### Starting a Challenge

```js
async function startChallenge(challengeId) {
  const challenge = CHALLENGES.find(c => c.id === challengeId);
  const now = Timestamp.now();
  const end = Timestamp.fromDate(
    new Date(Date.now() + challenge.duration * 86400000)
  );
  await addDoc(collection(db, 'userChallenges'), {
    clientId: clientData.id,
    challengeId,
    startDate: now,
    endDate: end,
    status: 'active',
    completedAt: null,
    badgeAwarded: false,
  });
}
```

### Completing a Challenge

When `computeProgress() >= challenge.goal`:
1. Update `userChallenges` doc: `status: 'completed'`, `completedAt: serverTimestamp()`
2. Award badge (add to `achievements` collection — same pattern as existing badges)
3. Optionally auto-post to journey feed (like existing badge posts)
4. Fire Facebook Pixel event

---

## 4. Dashboard Integration

**Modified file:** `admin/src/pages/CoreBuddyDashboard.jsx`

Add a **Challenge Card** in the feature cards section (after the workout card, before leaderboard card):

- **No active challenge:** Card shows "Start a Challenge" with a trophy icon + brief teaser + CTA link to `/client/core-buddy/challenges`
- **Active challenge:** Card shows mini progress ring + challenge name + "X days left" + fraction progress (e.g., "8/30") — tappable, links to full challenge page
- **Recently completed:** Card shows "Completed!" with challenge name for 24hrs, then reverts to browse state

This is a single `<Link>` card, ~40-50 lines of JSX, following the existing `.cb-feature-card` pattern.

**Also modify:** `CoreBuddyDashboard.css` — add styles for `.cb-card-challenge` following existing card patterns.

---

## 5. Routing

**Modified file:** `admin/src/App.jsx`

Add one new route (no LockedFeature wrapper — page handles its own gating):

```jsx
import Challenges from './pages/Challenges';
// ...
<Route path="/client/core-buddy/challenges" element={<Challenges />} />
```

---

## 6. Navigation

**No nav change for V1.** Access is via the dashboard card. Keeps the bottom nav uncluttered. Can promote to a bottom nav icon later if engagement is high.

The Challenges page includes a back button (same pattern as Leaderboard/UpgradePage).

---

## 7. Badge Integration

**Modified file:** `admin/src/utils/badgeConfig.js`

Add 3 new badges:

```js
{ id: 'first_challenge', cat: 'challenges', label: 'Challenger', desc: 'Complete your first challenge', threshold: 1 },
{ id: 'five_challenges', cat: 'challenges', label: 'Challenge Veteran', desc: 'Complete 5 challenges', threshold: 5 },
{ id: 'ten_challenges', cat: 'challenges', label: 'Challenge Legend', desc: 'Complete 10 challenges', threshold: 10 },
```

Badge images: placeholder SVG icons initially, proper PNGs to be added later.

---

## 8. Free vs Premium Gating

No changes to TierContext. Each challenge has a `premium` flag in the config. The Challenges page uses `isPremium` from `useTier()`:

- **Free users:** can start `starter_streak` and `habit_machine`
- **Free users:** see premium challenges with lock overlay → tapping shows upgrade prompt
- **Premium users:** all 6 challenges available

---

## 9. Facebook Pixel Event

In `Challenges.jsx` on challenge completion:

```js
if (typeof fbq === 'function') {
  fbq('trackCustom', 'ChallengeCompleted', {
    challenge_name: challenge.name,
    challenge_type: challenge.type,
    duration_days: challenge.duration,
  });
}
```

---

## 10. Files Summary

| Action | File | Est. Lines Changed |
|--------|------|--------------------|
| **Create** | `admin/src/config/challengeConfig.js` | ~80 |
| **Create** | `admin/src/pages/Challenges.jsx` | ~350-400 |
| **Create** | `admin/src/pages/Challenges.css` | ~250-300 |
| **Modify** | `admin/src/App.jsx` | +3 (import + route) |
| **Modify** | `admin/src/pages/CoreBuddyDashboard.jsx` | +50-60 (challenge card) |
| **Modify** | `admin/src/pages/CoreBuddyDashboard.css` | +30-40 (card styles) |
| **Modify** | `admin/src/utils/badgeConfig.js` | +3 (new badges) |
| **Rebuild** | `login/` build output | (automated) |

No changes to: TierContext, CoreBuddyNav, Firestore helpers, or existing workout/habit logging.

---

## 11. Implementation Order

1. `challengeConfig.js` — define the 6 challenges
2. `Challenges.jsx` + `Challenges.css` — full page with all 3 states + progress computation
3. `App.jsx` — add route
4. `CoreBuddyDashboard.jsx` + CSS — add challenge card
5. `badgeConfig.js` — add challenge badges
6. Build, test, commit, push
