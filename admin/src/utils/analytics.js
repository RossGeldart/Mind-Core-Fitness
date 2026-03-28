import mixpanel from '../config/mixpanel';

const track = (event, props) => {
  try {
    mixpanel.track(event, props);
  } catch (e) {
    // silently fail — analytics should never break the app
  }
};

// ── Auth ──
export const trackLogin = (method) => track('Login', { method });
export const trackSignup = (method) => track('Signup', { method });
export const trackLogout = () => track('Logout');

// ── Onboarding ──
export const trackOnboardingStep = (step, title) => track('Onboarding Step Viewed', { step, title });
export const trackOnboardingComplete = (tier) => track('Onboarding Complete', { tier });

// ── Workouts ──
export const trackWorkoutStarted = (props) => track('Workout Started', props);
export const trackWorkoutCompleted = (props) => track('Workout Completed', props);
export const trackWorkoutShared = () => track('Workout Shared');
export const trackExerciseSwapped = (exercise) => track('Exercise Swapped', { exercise });
export const trackBYOWorkoutBuilt = (props) => track('BYO Workout Built', props);

// ── Nutrition ──
export const trackMealLogged = (props) => track('Meal Logged', props);
export const trackFoodSearched = (query) => track('Food Searched', { query });
export const trackBarcodeScanned = (success) => track('Barcode Scanned', { success });
export const trackFavouriteSaved = (name) => track('Favourite Saved', { name });
export const trackFavouriteQuickAdded = (name) => track('Favourite Quick Added', { name });
export const trackDayCopied = () => track('Day Copied');
export const trackAIScanStarted = () => track('AI Scan Started');
export const trackAIScanCompleted = (props) => track('AI Scan Completed', props);
export const trackAIScanSaved = (props) => track('AI Scan Saved', props);

// ── Habits ──
export const trackHabitCompleted = (habit) => track('Habit Completed', { habit });
export const trackHabitUndone = (habit) => track('Habit Undone', { habit });
export const trackCustomHabitCreated = (name) => track('Custom Habit Created', { name });
export const trackCustomHabitDeleted = (name) => track('Custom Habit Deleted', { name });
export const trackAllHabitsComplete = (count) => track('All Habits Complete', { count });

// ── Social / Buddies ──
export const trackBuddyRequestSent = () => track('Buddy Request Sent');
export const trackBuddyRequestAccepted = () => track('Buddy Request Accepted');
export const trackBuddyRemoved = () => track('Buddy Removed');
export const trackPostLiked = () => track('Post Liked');
export const trackPostCommented = () => track('Post Commented');
export const trackBuddyTabChanged = (tab) => track('Buddy Tab Changed', { tab });

// ── Challenges ──
export const trackChallengeStarted = (props) => track('Challenge Started', props);
export const trackChallengeCompleted = (props) => track('Challenge Completed', props);

// ── Badges ──
export const trackBadgeViewed = (badge) => track('Badge Viewed', { badge });
export const trackBadgeEarned = (badge) => track('Badge Earned', { badge });

// ── Metrics / Body Tracking ──
export const trackMeasurementLogged = (metric) => track('Measurement Logged', { metric });
export const trackProgressPhotoUploaded = () => track('Progress Photo Uploaded');
export const trackGoalUpdated = (metric) => track('Goal Updated', { metric });

// ── Activity History ──
export const trackActivityLogged = (props) => track('Activity Logged', props);
export const trackActivityDeleted = (type) => track('Activity Deleted', { type });

// ── Personal Bests ──
export const trackPersonalBestLogged = (props) => track('Personal Best Logged', props);
export const trackPBExerciseAdded = (exercise) => track('PB Exercise Added', { exercise });

// ── Leaderboard ──
export const trackLeaderboardViewed = (props) => track('Leaderboard Viewed', props);
export const trackLeaderboardTabChanged = (tab) => track('Leaderboard Tab Changed', { tab });

// ── Charts ──
export const trackChartViewed = (props) => track('Chart Viewed', props);
export const trackChartPeriodChanged = (props) => track('Chart Period Changed', props);

// ── Dashboard Builder ──
export const trackWidgetToggled = (props) => track('Widget Toggled', props);
export const trackProfilePhotoUploaded = () => track('Profile Photo Uploaded');

// ── Settings ──
export const trackThemeChanged = (theme) => track('Theme Changed', { theme });
export const trackNotificationToggled = (props) => track('Notification Toggled', props);
export const trackSubscriptionManaged = () => track('Subscription Managed');

// ── Client Dashboard / Sessions ──
export const trackSessionRescheduled = () => track('Session Rescheduled');
export const trackSessionCancelled = () => track('Session Cancelled');

// ── Client Forms ──
export const trackFormSubmitted = (form) => track('Form Submitted', { form });

// ── Client Tools ──
export const trackMacroCalculated = (goal) => track('Macro Calculated', { goal });
export const trackSnackViewed = (name) => track('Snack Viewed', { name });

// ── Upgrade ──
export const trackUpgradeViewed = (props) => track('Upgrade Page Viewed', props);
export const trackUpgradeStarted = (props) => track('Upgrade Started', props);
