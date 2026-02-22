import firstWorkoutBadge from '../assets/first_workout.PNG';
import workouts10Badge from '../assets/workouts_10.PNG';
import workouts25Badge from '../assets/workouts_25.PNG';
import workouts50Badge from '../assets/workouts_50.PNG';
import workouts100Badge from '../assets/workouts_100.PNG';
import streak2Badge from '../assets/streak_2.PNG';
import streak4Badge from '../assets/streak_4.PNG';
import streak8Badge from '../assets/streak_8.PNG';

import nutrition7Badge from '../assets/nutrition_7.PNG';
import leaderboardJoinBadge from '../assets/leaderboard_join.PNG';
import habits7Badge from '../assets/habits_7.PNG';
import starterStreakBadge from '../assets/starter_streak.PNG';
import consistencyKingBadge from '../assets/consistency_king.PNG';
import thirtyInThirtyBadge from '../assets/thirty_in_thirty.PNG';
import minuteMasterBadge from '../assets/minute_master.PNG';
import habitMachineBadge from '../assets/habit_machine.PNG';
import ironWillBadge from '../assets/iron_will.PNG';

const BADGE_DEFS = [
  // Workout badges
  { id: 'first_workout', img: firstWorkoutBadge, name: 'First Rep', desc: 'Complete your first workout', category: 'workouts', threshold: 1 },
  { id: 'workouts_10', img: workouts10Badge, name: 'On Fire', desc: 'Complete 10 workouts', category: 'workouts', threshold: 10 },
  { id: 'workouts_25', img: workouts25Badge, name: 'Dedicated', desc: 'Complete 25 workouts', category: 'workouts', threshold: 25 },
  { id: 'workouts_50', img: workouts50Badge, name: 'Unstoppable', desc: 'Complete 50 workouts', category: 'workouts', threshold: 50 },
  { id: 'workouts_100', img: workouts100Badge, name: 'Century', desc: 'Complete 100 workouts', category: 'workouts', threshold: 100 },
  // Streak badges
  { id: 'streak_2', img: streak2Badge, name: '2 Week Streak', desc: 'Work out for 2 weeks in a row', category: 'streaks', threshold: 2 },
  { id: 'streak_4', img: streak4Badge, name: 'Month Strong', desc: 'Work out for 4 weeks in a row', category: 'streaks', threshold: 4 },
  { id: 'streak_8', img: streak8Badge, name: 'Iron Will', desc: 'Work out for 8 weeks in a row', category: 'streaks', threshold: 8 },
  // Nutrition badges
  { id: 'nutrition_7', img: nutrition7Badge, name: 'Macro Master', desc: 'Hit your macro targets 7 days in a row', category: 'nutrition', threshold: 7 },
  // Leaderboard badges
  { id: 'leaderboard_join', img: leaderboardJoinBadge, name: 'Competitor', desc: 'Join the leaderboard', category: 'leaderboard', threshold: 1 },
  // Habit badges
  { id: 'habits_7', img: habits7Badge, name: 'Habit Streak', desc: 'Complete your daily habits 7 days in a row', category: 'habits', threshold: 7 },
  // Challenge badges (one per challenge)
  { id: 'starter_streak', img: starterStreakBadge, name: 'Starter Streak', desc: 'Complete 5 workouts in 7 days', category: 'challenges', threshold: 1 },
  { id: 'consistency_king', img: consistencyKingBadge, name: 'Consistency King', desc: 'Complete 12 workouts in 30 days', category: 'challenges', threshold: 1 },
  { id: 'thirty_in_thirty', img: thirtyInThirtyBadge, name: '30 in 30', desc: 'Complete 30 workouts in 30 days', category: 'challenges', threshold: 1 },
  { id: 'minute_master', img: minuteMasterBadge, name: 'Minute Master', desc: 'Train for 300 total minutes in 30 days', category: 'challenges', threshold: 1 },
  { id: 'habit_machine', img: habitMachineBadge, name: 'Habit Machine', desc: 'Hit all daily habits for 7 days straight', category: 'challenges', threshold: 1 },
  { id: 'iron_will', img: ironWillBadge, name: 'Iron Will', desc: 'Work out every day for 14 days straight', category: 'challenges', threshold: 1 },
];

export default BADGE_DEFS;
