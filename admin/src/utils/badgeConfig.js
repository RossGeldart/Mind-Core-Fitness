import firstWorkoutBadge from '../assets/first_workout.PNG';
import workouts10Badge from '../assets/workouts_10.PNG';
import workouts25Badge from '../assets/workouts_25.PNG';
import workouts50Badge from '../assets/workouts_50.PNG';
import workouts100Badge from '../assets/workouts_100.PNG';

const BADGE_DEFS = [
  { id: 'first_workout', img: firstWorkoutBadge, name: 'First Rep', desc: 'Complete your first workout', category: 'workouts', threshold: 1 },
  { id: 'workouts_10', img: workouts10Badge, name: 'On Fire', desc: 'Complete 10 workouts', category: 'workouts', threshold: 10 },
  { id: 'workouts_25', img: workouts25Badge, name: 'Dedicated', desc: 'Complete 25 workouts', category: 'workouts', threshold: 25 },
  { id: 'workouts_50', img: workouts50Badge, name: 'Unstoppable', desc: 'Complete 50 workouts', category: 'workouts', threshold: 50 },
  { id: 'workouts_100', img: workouts100Badge, name: 'Century', desc: 'Complete 100 workouts', category: 'workouts', threshold: 100 },
];

export default BADGE_DEFS;
