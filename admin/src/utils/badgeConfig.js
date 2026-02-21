import firstWorkoutBadge from '../assets/first_workout.PNG';
import workouts10Badge from '../assets/workouts_10.PNG';
import workouts25Badge from '../assets/workouts_25.PNG';
import workouts50Badge from '../assets/workouts_50.PNG';
import workouts100Badge from '../assets/workouts_100.PNG';
import streak2Badge from '../assets/streak_2.PNG';
import streak4Badge from '../assets/streak_4.PNG';
import streak8Badge from '../assets/streak_8.PNG';
import firstPbBadge from '../assets/first_pb.PNG';
import pbs5Badge from '../assets/pbs_5.PNG';
import pbs10Badge from '../assets/pbs_10.PNG';
import pbs100Badge from '../assets/pbs_100.PNG';
import nutrition7Badge from '../assets/nutrition_7.PNG';
import leaderboardJoinBadge from '../assets/leaderboard_join.PNG';
import habits7Badge from '../assets/habits_7.PNG';

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
  // Personal best badges
  { id: 'first_pb', img: firstPbBadge, name: 'First PB', desc: 'Set your first personal best', category: 'pbs', threshold: 1 },
  { id: 'pbs_5', img: pbs5Badge, name: 'PB Hunter', desc: 'Set 5 personal bests', category: 'pbs', threshold: 5 },
  { id: 'pbs_10', img: pbs10Badge, name: 'PB Machine', desc: 'Set 10 personal bests', category: 'pbs', threshold: 10 },
  { id: 'pbs_100', img: pbs100Badge, name: 'PB Legend', desc: 'Set 100 personal bests', category: 'pbs', threshold: 100 },
  // Nutrition badges
  { id: 'nutrition_7', img: nutrition7Badge, name: 'Macro Master', desc: 'Hit your macro targets 7 days in a row', category: 'nutrition', threshold: 7 },
  // Leaderboard badges
  { id: 'leaderboard_join', img: leaderboardJoinBadge, name: 'Competitor', desc: 'Join the leaderboard', category: 'leaderboard', threshold: 1 },
  // Habit badges
  { id: 'habits_7', img: habits7Badge, name: 'Habit Streak', desc: 'Complete your daily habits 7 days in a row', category: 'habits', threshold: 7 },
  // Challenge badges (placeholder images — swap for real PNGs later)
  { id: 'first_challenge', img: null, name: 'Challenger', desc: 'Complete your first challenge', category: 'challenges', threshold: 1 },
  { id: 'five_challenges', img: null, name: 'Challenge Veteran', desc: 'Complete 5 challenges', category: 'challenges', threshold: 5 },
  { id: 'ten_challenges', img: null, name: 'Challenge Legend', desc: 'Complete 10 challenges', category: 'challenges', threshold: 10 },
];

export default BADGE_DEFS;
